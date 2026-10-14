/* LE SECRÉTARIAT ADMINISTRATIF, ÉPROUVÉ — 14 octobre 2026.
   `node scripts/verifie-le-secretariat-administratif.mjs`

   Ce que la maquette TChByryY… a promis, et ce que ses quatre choix ont
   décidé : les numéros du courrier, les échéances qui reviennent, ce qui
   tombe (à l'écran ET dans la notification, même bloc), qui voit quoi (le
   miroir de 0129), l'année close, la notification à J-7 et la veille, les
   onglets montrés selon qui l'on est. Les règles de la BASE (0129) se sont
   éprouvées dans un vrai Postgres (PGlite, 31 contrôles, trois pannes
   plantées toutes vues) ; ici on tient le texte de la migration. */
import { readFileSync } from 'node:fs';
import {
  ajouteJours, ajouteMois, anneesCloses, aRevoir, attendMaSignature, ceQuiTombe, dateCourte, ecartEnJours, estFige, JOURS_DE_NOTIFICATION,
  courrierRepondu, enAttenteDUneReponse, marqueFaite, montantDit, peutEcrire, placeDuRecu, prochainNumeroDuCourrier, rappelDit, recuLeDe, sousTrenteJours, voit,
  type Contrat, type Courrier, type Echeance, type Qui,
} from '../src/shared/secretariat-admin-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sansCommentairesSql = (f: string) => lis(f).replace(/--.*$/gm, '');
const base = { branchId: 'b', entite: 'mnd' as const, creeLe: '2026-10-14T08:00:00Z', creePar: 'u' };

/* ── 1. LES NUMÉROS DU COURRIER ── */
dit('le premier courrier arrive de 2026 est A-2026-001', 'A-2026-001', prochainNumeroDuCourrier('arrive', 2026, []));
dit('le suivant suit le plus grand, pas le nombre', 'A-2026-015', prochainNumeroDuCourrier('arrive', 2026, ['A-2026-003', 'A-2026-014', 'D-2026-020', 'A-2025-090']));
dit('le depart a sa propre serie', 'D-2026-021', prochainNumeroDuCourrier('depart', 2026, ['A-2026-003', 'D-2026-020']));
dit('une nouvelle annee repart a 001', 'A-2027-001', prochainNumeroDuCourrier('arrive', 2027, ['A-2026-099']));

/* ── 2. LES DATES ── */
dit('le 31 janvier plus un mois tombe le 28 fevrier', '2027-02-28', ajouteMois('2027-01-31', 1));
dit('en annee bissextile, le 29', '2028-02-29', ajouteMois('2028-01-31', 1));
dit('decembre plus un mois passe l annee', '2027-01-15', ajouteMois('2026-12-15', 1));
dit('ajouteJours et ecartEnJours se repondent', [7, '2026-10-21'], [ecartEnJours('2026-10-14', '2026-10-21'), ajouteJours('2026-10-14', 7)]);
dit('une date se dit toujours avec son annee', '9 oct. 2028', dateCourte('2028-10-09'));
dit('le rappel se dit', ['dépassé de 2 jours', 'aujourd’hui', 'demain', 'dans 7 jours', 'dans 20 jours'],
  ['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-21', '2026-11-03'].map((d) => rappelDit(d, '2026-10-14').mot));
dit('un montant reste dans sa devise', [true, true], [/^2\s?140 USD$/.test(montantDit(2140, 'USD').replace(/ | /g, ' ')), montantDit(10000, 'XOF').endsWith(' F')]);

/* ── 3. LES ÉCHÉANCES QUI REVIENNENT ── */
const loyer: Echeance = { ...base, id: 'e1', genre: 'echeance', titre: 'Loyer', type: 'loyer', date: '2026-10-31', recurrence: 'mensuelle', faites: [] };
const fait = marqueFaite(loyer, '2026-10-30T10:00:00Z', 'u');
dit('le loyer fait se repose au mois suivant, au dernier jour', ['2026-11-30', false, 1], [fait.date, !!fait.terminee, fait.faites.length]);
const une = marqueFaite({ ...loyer, recurrence: 'aucune' }, '2026-10-30T10:00:00Z', 'u');
dit('une echeance d une fois se termine', true, !!une.terminee);

/* ── 4. CE QUI TOMBE ── */
const lignes: { [k: string]: unknown }[] = [
  { id: 'e1', genre: 'echeance', titre: 'Loyer', date: '2026-10-31' },
  { id: 'e2', genre: 'echeance', titre: 'Faite', date: '2026-10-20', terminee: true },
  { id: 'e3', genre: 'echeance', titre: 'À dater' },
  { id: 'c1', genre: 'courrier', sens: 'arrive', etat: 'a-traiter', correspondant: 'Moov Africa', numero: 'A-2026-014', reponseAvant: '2026-10-21', traitePar: 'x' },
  { id: 'c2', genre: 'courrier', sens: 'arrive', etat: 'repondu', correspondant: 'Banque', numero: 'A-2026-013', reponseAvant: '2026-10-16' },
  { id: 'd1', genre: 'demarche', etat: 'en-attente', titre: 'OAPI', prochaine: 'relancer', prochaineLe: '2026-10-28' },
  { id: 'd2', genre: 'demarche', etat: 'terminee', titre: 'APIEX', prochaineLe: '2026-10-15' },
  { id: 'k1', genre: 'contrat', etat: 'en-cours', titre: 'Zoho', fin: '2026-12-31', preavisJours: 30, renouvellement: 'tacite', prive: true },
  { id: 'k2', genre: 'contrat', etat: 'resilie', titre: 'Ancien', fin: '2026-11-01' },
];
const t = ceQuiTombe(lignes);
dit('ce qui tombe, dans l ordre des dates', [
  'c1:reponse:2026-10-21', 'd1:prochaine:2026-10-28', 'e1:date:2026-10-31', 'k1:preavis:2026-12-01', 'k1:fin:2026-12-31',
], t.map((x) => x.cle));
dit('les titres disent quoi faire', ['Répondre à Moov Africa (A-2026-014)', 'OAPI : relancer', 'Renouvellement : Zoho'], [t[0].titre, t[1].titre, t[4].titre]);
dit('le prive et la personne confiee suivent', [true, 'x'], [t[3].prive, t[0].traitePar]);
dit('sous trente jours au 14 octobre : trois', 3, sousTrenteJours(t, '2026-10-14').length);
dit('la notification part a J-7 et la veille', [7, 1], JOURS_DE_NOTIFICATION);
const zoho = { ...base, id: 'k1', genre: 'contrat', titre: 'Zoho', type: 'abonnement', avecQui: 'Zoho', renouvellement: 'tacite', preavisJours: 30, devise: 'USD', periodicite: 'an', fichiers: [], etat: 'en-cours', fin: '2026-12-31' } as Contrat;
dit('un contrat est a revoir quand son preavis tombe sous 60 jours', [false, true], [aRevoir(zoho, '2026-09-01'), aRevoir(zoho, '2026-10-14')]);

/* ── 5. QUI VOIT QUOI : le miroir de 0129 ── */
const D: Qui = { direction: true, titulaire: false, moi: 'd' };
const T: Qui = { direction: false, titulaire: true, moi: 't' };
const M: Qui = { direction: false, titulaire: false, moi: 'm' };
const C: Qui = { direction: false, titulaire: false, moi: 'c' };
const ech = { genre: 'echeance' };
const cou = { genre: 'courrier', traitePar: 'c' };
const ctc = { genre: 'contact' };
const priv = { genre: 'echeance', prive: true };
dit('une echeance : direction et titulaire, pas un maitre', [true, true, false], [voit(ech, D), voit(ech, T), voit(ech, M)]);
dit('un courrier confie : la personne le voit, un autre maitre non', [true, false, true], [voit(cou, C), voit(cou, M), voit(cou, T)]);
dit('un contact : tout le personnel le lit, seul le secretariat l ecrit', [true, false, true], [voit(ctc, M), peutEcrire(ctc, M, true), peutEcrire(ctc, T, true)]);
dit('le prive : la direction seule', [true, false], [voit(priv, D), voit(priv, T)]);
dit('la personne confiee retouche son courrier, n en cree pas', [true, false], [peutEcrire(cou, C, false), peutEcrire(cou, C, true)]);
dit('clore : la direction seule', [true, false], [peutEcrire({ genre: 'cloture' }, D, true), peutEcrire({ genre: 'cloture' }, T, true)]);
dit('un document reste a tout le personnel', true, peutEcrire({ genre: 'piece' }, M, true));

/* ── 6. L'ANNÉE CLOSE ── */
const courrier = { ...base, id: 'c', genre: 'courrier', sens: 'arrive', numero: 'A-2026-001', date: '2026-03-02', correspondant: 'X', objet: '', etat: 'classe', fichiers: [] } as Courrier;
const closes = anneesCloses([{ genre: 'cloture', annee: 2026 }, { genre: 'contact' }]);
dit('2026 close : le courrier est fige, sauf pour la direction', [[2026], true, false], [closes, estFige(courrier, closes, false), estFige(courrier, closes, true)]);
dit('un document attend ma signature tant que je ne l ai pas posee', [true, false],
  [attendMaSignature({ etat: 'brouillon', signataires: [{ userId: 'u' }], poses: [] }, 'u'), attendMaSignature({ etat: 'brouillon', signataires: [{ userId: 'u' }], poses: [{ cle: 'sig:u', image: 'x' }] }, 'u')]);

/* ── 6 bis. LE TAMPON « REÇU LE » SUR LA PHOTO (maquette, lot 1) ── */
dit('un courrier arrive se tamponne a sa date ; un depart, une date illisible, non', ['2026-10-14', undefined, undefined],
  [recuLeDe({ sens: 'arrive', date: '2026-10-14' }), recuLeDe({ sens: 'depart', date: '2026-10-14' }), recuLeDe({ sens: 'arrive', date: '' })]);
const dans = (w: number, h: number) => { const p = placeDuRecu(w, h, 1.5); return p.x > 0 && p.y > 0 && p.x + p.l < w && p.y + p.h < h && p.x > w / 2 && p.y + p.h <= h / 4 + p.y; };
dit('le tampon tient dans la photo, en haut a droite : A4 debout, couchee, ticket etroit', [true, true, true], [dans(1555, 2200), dans(2200, 1555), dans(2200, 300)]);
dit('sur une feuille A4 il fait un quart de la largeur, environ 5 cm', [404, 269], (({ l, h }) => [l, h])(placeDuRecu(1555, 2200, 1.5)));
dit('sur un ticket etroit il ne passe pas le quart de la hauteur', 75, placeDuRecu(2200, 300, 1.5).h);
const adm = sansCommentaires('src/shared/secretariat-admin.ts');
dit('la photo est tamponnee avant de partir ; un PDF part tel quel ; un tampon qui manque ne perd pas la lettre', [true, true, true], [
  adm.includes('if (recuLe) corps = await tamponneLaPhoto(corps, recuLe);'),
  adm.includes("if (!photo.type.startsWith('image/')) return photo;"),
  /\} catch \{\s+return photo;\s+\}/.test(adm),
]);
dit('le courrier neuf et la photo ajoutee passent la date d arrivee', [true, true], [
  sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Courrier.tsx').includes('await deposeLesFichiers(c.id, fichiers, 0, recuLeDe(c));'),
  sansCommentaires('src/apps/trone/routes/pilotage/secretariat/_admin.tsx').includes('deposeLesFichiers(ligne.id, pris.fichiers, ligne.fichiers.length, recuLe);'),
]);

/* ── 6 ter. CE QUE LA MAQUETTE A PROMIS AUTOUR DU COURRIER ── */
const arrive = (id: string, etat: string) => ({ ...base, id, genre: 'courrier', sens: 'arrive', numero: 'A-2026-00' + id, date: '2026-10-01', correspondant: 'X', objet: '', etat, fichiers: [] }) as Courrier;
const arrives = [arrive('1', 'a-traiter'), arrive('2', 'classe')];
dit('la reponse part : son courrier a traiter passe a repondu ; un classe ne bouge pas ; sans lien, rien', ['1', undefined, undefined], [
  courrierRepondu({ sens: 'depart', repondA: '1' }, arrives)?.id, courrierRepondu({ sens: 'depart', repondA: '2' }, arrives)?.id, courrierRepondu({ sens: 'depart' }, arrives)?.id,
]);
dit('une demarche envoyee attend, et sa relance se pose a J+7', { etat: 'en-attente', prochaine: 'Relancer', prochaineLe: '2026-10-21' }, enAttenteDUneReponse({}, '2026-10-14'));
dit('une action deja datee plus tard reste la sienne ; une date passee devient la relance', ['2026-11-30', '2026-10-21'], [
  enAttenteDUneReponse({ prochaine: 'Deposer', prochaineLe: '2026-11-30' }, '2026-10-14').prochaineLe, enAttenteDUneReponse({ prochaine: 'Deposer', prochaineLe: '2026-10-01' }, '2026-10-14').prochaineLe,
]);
const cou2 = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Courrier.tsx');
const ech2 = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Echeancier.tsx');
dit('C est envoye passe par envoieLeDepart ; un courrier cree son echeance, liee', [true, true, true], [
  cou2.includes('envoieLeDepart(c, lignes, jour);'), cou2.includes('onClick={() => setEcheancePour(c)}>Créer une échéance</Button>'),
  ech2.includes('courrierId: modele?.courrierId, demarcheId: modele?.demarcheId'),
]);
dit('une echeance qui se paie mene aux depenses, sans rien y ecrire', [true, false], [
  ech2.includes("const QUI_SE_PAIENT: TypeEcheance[] = ['impots', 'social', 'loyer', 'contrat'];") && ech2.includes("navigate('/depenses')"),
  ech2.includes('depensesStore'),
]);
dit('la demarche envoyee passe par enAttenteDUneReponse', true, sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Demarches.tsx').includes('const p = enAttenteDUneReponse(d, jour);'));

/* ── 7. LE MÊME CALCUL À L'ÉCRAN ET DANS LA NOTIFICATION ── */
const bloc = (f: string) => { const s = lis(f); const a = s.indexOf('/* ⟨ce-qui-tombe⟩ */'); const b = s.indexOf('/* ⟨/ce-qui-tombe⟩ */'); return a >= 0 && b > a ? s.slice(a, b) : `ABSENT de ${f}`; };
dit('push-notify porte le bloc ⟨ce-qui-tombe⟩ a l identique', bloc('src/shared/secretariat-admin-pur.ts'), bloc('supabase/functions/push-notify/index.ts'));
const pn = sansCommentaires('supabase/functions/push-notify/index.ts');
dit('le passage du secretariat tourne avec le cron du personnel', true, /mode === 'staff-cron'[\s\S]{0,200}secretariat: await rappelDuSecretariat\(\)/.test(pn));
dit('seul le passage de 8 h agit, vingt au plus, une fois par rappel', [true, true, true, true], [
  pn.includes('if (ici.getUTCHours() !== 8) return 0;'), pn.includes('const SECRETARIAT_MAX_PAR_PASSAGE = 20;'),
  pn.includes('if (faits >= SECRETARIAT_MAX_PAR_PASSAGE) break;'), /push_reminders'\)\.insert\(\{ appointment_id: cle, kind \}\)/.test(pn),
]);
dit('le prive va a la direction seule, sans rien dire de lui', [true, true], [
  pn.includes('const pour = t.prive ? direction'), /body: t\.prive \? `Une date privée tombe \$\{quand\} : ouvrez le secrétariat\.`/.test(pn),
]);
dit('on juge la date de la ligne, jamais sa derniere ecriture', false, /rappelDuSecretariat[\s\S]{0,2500}updated_at/.test(pn));

/* ── 8. LA BASE (texte de 0129, éprouvé à part dans PGlite) ── */
const sql = sansCommentairesSql('supabase/migrations/0129_le_secretariat_administratif.sql');
dit('le role vit dans une table que la direction seule remplit', [true, true], [
  /create policy sec_titulaires_donner on public\.secretariat_titulaires for insert to authenticated\s+with check \(public\.est_direction\(\)\);/.test(sql),
  /create policy sec_titulaires_retirer on public\.secretariat_titulaires for delete to authenticated\s+using \(public\.est_direction\(\)\);/.test(sql),
]);
dit('lire : echeances, contrats, demarches, clotures au secretariat ; le courrier aussi a qui il est confie', [true, true], [
  sql.includes("when data->>'genre' in ('echeance', 'contrat', 'demarche', 'cloture') then public.tient_le_secretariat()"),
  sql.includes("when data->>'genre' = 'courrier' then public.tient_le_secretariat() or data->>'traitePar' = auth.uid()::text"),
]);
dit('le prive de 0122 reste mot pour mot : lire, ecrire, modifier (avant et apres)', 4,
  (sql.match(/\(\(coalesce\(data->>'entite', ''\) <> 'perso' and coalesce\(data->>'prive', ''\) <> 'true'\) or public\.est_direction\(\)\)/g) ?? []).length);
dit('les gardes : courrier neuf, genre fige, annee close', [true, true, true], [
  sql.includes("raise exception 'Seul le secrétariat enregistre un courrier.';"),
  sql.includes("raise exception 'Le genre d''une ligne du secrétariat ne change pas.';"),
  sql.includes("raise exception 'L''année % est close : seule la direction y touche.', annee;"),
]);
dit('le compartiment est prive ; un fichier se lit si sa ligne se lit', [true, true], [
  sql.includes("values ('secretariat', 'secretariat', false,"),
  sql.includes("and exists (select 1 from public.secretariat s where s.id = (storage.foldername(name))[1])"),
]);

/* ── 9. L'ÉCRAN ── */
const page = sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx');
dit('les onglets suivent le role', [true, true, true, true], [
  page.includes("{ k: 'jour', l: 'Aujourd’hui', si: tient }, { k: 'courrier', l: 'Le courrier', si: tient || confie }"),
  page.includes("{ k: 'echeances', l: 'L’échéancier', si: tient }, { k: 'contrats', l: 'Contrats', si: tient }"),
  page.includes("{ k: 'documents', l: 'Les documents', si: true }, { k: 'papiers', l: 'Les papiers', si: direction }"),
  page.includes("{ k: 'bourse', l: 'Bourse scolaire', si: direction }, { k: 'archives', l: 'Archives', si: tient }"),
]);
dit('« A faire » porte le rappel du secretariat', true, sansCommentaires('src/apps/trone/routes/pilotage/AFaire.tsx').includes('<RappelDuSecretariat />'));
dit('Acces et roles donne le role par la table, pas par l ecran', true, sansCommentaires('src/apps/trone/routes/systeme/Acces.tsx').includes('const r = await donneLeRole(userId, oui, myId ?? \'\');'));
const ecrans = ['_admin', 'Aujourdhui', 'Courrier', 'Echeancier', 'Contrats', 'Demarches', 'Contacts', 'Archives', 'RappelDuSecretariat']
  .map((n) => [n, sansCommentaires(`src/apps/trone/routes/pilotage/secretariat/${n}.tsx`)] as const);
dit('aucun tiret cadratin dans ce que les ecrans disent', [], ecrans.filter(([, s]) => s.includes('—')).map(([n]) => n));

console.log(ko === 0 ? '\nLe secretariat administratif tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
