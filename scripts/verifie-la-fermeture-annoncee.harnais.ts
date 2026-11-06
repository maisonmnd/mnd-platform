/* LA FERMETURE ANNONCÉE ET L'HEURE D'OUVERTURE, ÉPROUVÉES · 6 novembre 2026.
   `node scripts/verifie-la-fermeture-annoncee.mjs` (et `--prouve`).

   Trois demandes de Yéman, le même soir :
   1. « Notifier sur le site internet et sur Ma Couronne que le salon est
      fermé du [vendredi] 1er au mardi 5, qu'on reprend le mercredi 6 janvier »,
      et la cadence ne tombe pas sur ces jours-là ;
   2. « Il faut toujours regarder les jours des clients, les jours favoris » ;
   3. « Personne n'a le droit d'avoir dans son calendrier 8 h 30 un samedi ».
   Dates inventées sur la vraie semaine de la Maison. */
import { readFileSync } from 'node:fs';
import { fermetureAnnoncee, phraseDeLaFermeture, phraseDeLaFermetureEn, periodeDite, dateDite } from '../src/shared/fermeture-pur';
import { poseLaDateSelon } from '../src/shared/cadence-pur';
import { ouvertureDuJour } from '../src/shared/agenda-pur';
import { bloqueLaPose, raisonDeLHeure } from '../src/apps/trone/routes/clients/rdv-fluide-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* La semaine de la Maison : 8 h en semaine, 9 h le samedi, fermée le lundi et le dimanche. */
const SEMAINE = [
  { key: 'lun', open: '08h00', close: '20h30', closed: true }, { key: 'mar', open: '08h00', close: '20h30', closed: false },
  { key: 'mer', open: '08h00', close: '20h30', closed: false }, { key: 'jeu', open: '08h00', close: '20h30', closed: false },
  { key: 'ven', open: '08h00', close: '20h30', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
  { key: 'dim', open: '10h00', close: '16h00', closed: true },
];
const ferme = (date: string, extra: Record<string, unknown> = {}) => ({ id: `hx-${date}`, date, open: '', close: '', closed: true, note: 'Fermeture annuelle', ...extra });
const JANVIER = ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05'].map((d) => ferme(d));

/* ── 1. Ce qui s'annonce ── */
const f = fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: JANVIER });
dit('les cinq jours de janvier : une fermeture, reprise le mercredi 6', { du: '2027-01-01', au: '2027-01-05', reprise: '2027-01-06', exceptionnels: 5, note: 'Fermeture annuelle' }, f);
dit('la phrase du site, mot pour mot', { ferme: 'La Maison MND est fermée du vendredi 1er au mardi 5 janvier 2027.', reprise: 'Réouverture le mercredi 6 janvier 2027.' }, f && phraseDeLaFermeture(f, '2026-11-06'));
dit('la phrase anglaise de Ma Couronne', { ferme: 'Maison MND is closed from Friday 1 to Tuesday 5 January 2027.', reprise: 'Reopening on Wednesday 6 January 2027.' }, f && phraseDeLaFermetureEn(f, '2026-11-06'));
const troue = fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: [ferme('2027-01-01'), ferme('2027-01-02'), ferme('2027-01-05')] });
dit('le dimanche et le lundi, fermés par la semaine, recousent la suite', { du: '2027-01-01', au: '2027-01-05', reprise: '2027-01-06' }, troue && { du: troue.du, au: troue.au, reprise: troue.reprise });
const separees = fermetureAnnoncee({ aujourdhui: '2026-11-25', semaine: SEMAINE, exceptions: [ferme('2026-12-01'), ferme('2026-12-03')] });
dit('un mercredi ouvert entre deux jours fermés : deux annonces, la première seule', { du: '2026-12-01', au: '2026-12-01' }, separees && { du: separees.du, au: separees.au });
dit('soixante jours avant, pas plus tôt', [null, '2027-01-01'],
  [fermetureAnnoncee({ aujourdhui: '2026-10-31', semaine: SEMAINE, exceptions: JANVIER })?.du ?? null, fermetureAnnoncee({ aujourdhui: '2026-11-02', semaine: SEMAINE, exceptions: JANVIER })?.du ?? null]);
dit('un seul jour : quatorze jours avant', [null, '2026-11-20'],
  [fermetureAnnoncee({ aujourdhui: '2026-11-05', semaine: SEMAINE, exceptions: [ferme('2026-11-20')] })?.du ?? null, fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: [ferme('2026-11-20')] })?.du ?? null]);
dit('un jour seul trop loin ne cache pas la vraie fermeture qui suit', '2027-01-01',
  fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: [ferme('2026-11-27'), ...JANVIER] })?.du ?? null);
dit('la journée d une seule personne ne s annonce pas', null,
  fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: JANVIER.map((x) => ({ ...x, staffId: 'st-x' })) }));
dit('une journée aux heures changées n est pas une fermeture', null,
  fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: [{ date: '2026-11-20', open: '10h00', close: '', closed: false }] }));
const enCours = fermetureAnnoncee({ aujourdhui: '2027-01-03', semaine: SEMAINE, exceptions: JANVIER });
dit('pendant la fermeture : « jusqu au mardi 5 »', 'La Maison MND est fermée jusqu’au mardi 5 janvier 2027.', enCours && phraseDeLaFermeture(enCours, '2027-01-03').ferme);
dit('le lendemain du dernier jour, plus rien', null, fermetureAnnoncee({ aujourdhui: '2027-01-06', semaine: SEMAINE, exceptions: JANVIER }));
dit('les notes différentes ne font pas de pastille', undefined,
  fermetureAnnoncee({ aujourdhui: '2026-11-06', semaine: SEMAINE, exceptions: [ferme('2027-01-01'), ferme('2027-01-02', { note: 'Inventaire' })] })?.note);
dit('les dates se disent avec l année, le 1er, et le mois une fois', ['du lundi 28 décembre 2026 au mardi 5 janvier 2027', 'du vendredi 27 novembre au mardi 1er décembre 2026', 'du vendredi 1er au mardi 5 janvier 2027', 'samedi 9 janvier 2027'],
  [periodeDite('2026-12-28', '2027-01-05'), periodeDite('2026-11-27', '2026-12-01'), periodeDite('2027-01-01', '2027-01-05'), dateDite('2027-01-09')]);
dit('un jour seul se dit « le »', 'La Maison MND est fermée le vendredi 20 novembre 2026.',
  phraseDeLaFermeture({ du: '2026-11-20', au: '2026-11-20', reprise: '2026-11-21', exceptionnels: 1 }, '2026-11-06').ferme);
dit('jamais de tiret cadratin dans ce que lit la cliente', false,
  /—/.test(JSON.stringify([f && phraseDeLaFermeture(f, '2026-11-06'), f && phraseDeLaFermetureEn(f, '2026-11-06'), enCours && phraseDeLaFermeture(enCours, '2027-01-03')])));

/* ── 2. La cadence garde son jour après une fermeture ── */
const estFerme = (iso: string) => ouvertureDuJour(iso, SEMAINE, JANVIER).closed;
dit('ses jours jeudi et vendredi : le jeudi 7, pas le mercredi 6', '2027-01-07', poseLaDateSelon('2027-01-01', [5, 4], estFerme));
dit('son samedi : le samedi 9', '2027-01-09', poseLaDateSelon('2027-01-01', [6], estFerme));
dit('sans jour : le premier jour ouvert, le mercredi 6', '2027-01-06', poseLaDateSelon('2027-01-01', undefined, estFerme));
dit('un jour que la Maison ferme toujours (le lundi) : le premier jour ouvert après', '2027-01-06', poseLaDateSelon('2027-01-01', [1], estFerme));
dit('hors fermeture, rien ne change : son vendredi le plus proche', '2026-11-13', poseLaDateSelon('2026-11-10', [5], estFerme));

/* ── 3. Aucun rendez-vous avant l'ouverture d'un jour ouvert ── */
const SAMEDI = ouvertureDuJour('2026-11-28', SEMAINE, []);
const MARDI = ouvertureDuJour('2026-11-24', SEMAINE, []);
const LUNDI = ouvertureDuJour('2026-11-23', SEMAINE, []);
const raison = (heure: string, ouverture: typeof SAMEDI) => raisonDeLHeure({ heure, durationMin: 105, maitre: 'Team', ouverture, occupes: [], bloques: [], sieges: 2, jourDit: 'samedi 28 novembre 2026' });
const r830 = raison('08:30', SAMEDI);
dit('8 h 30 un samedi : bloqué, sans passe-droit, l heure d ouverture dite', { bloque: true, sansPasseDroit: true, dit9h: true }, { bloque: r830?.bloque, sansPasseDroit: r830?.sansPasseDroit, dit9h: !!r830?.texte.includes('09:00') });
dit('9 h un samedi, 8 h 30 un mardi : rien à dire', [null, null], [raison('09:00', SAMEDI), raison('08:30', MARDI)]);
dit('un lundi fermé ouvert exprès garde la main (pas de passe-droit refusé)', false, !!raison('08:30', LUNDI)?.sansPasseDroit);
const pose = (o: Partial<Parameters<typeof bloqueLaPose>[0]>) => bloqueLaPose({ raison: r830, statut: 'confirmé', date: '2026-11-28', time: '08:30', dureeMin: 105, ...o });
dit('« Poser quand même » ne lève pas l heure d ouverture', true, pose({ force: true }));
dit('... un rendez-vous relu qui ne bouge pas s enregistre (une note), un passé honoré aussi', [false, false],
  [pose({ relu: { date: '2026-11-28', time: '08:30', dureeMin: 105 } }), pose({ statut: 'honoré' })]);
dit('... mais le fauteuil plein, lui, se force toujours', false,
  bloqueLaPose({ raison: { bloque: true, texte: 'plein' }, statut: 'confirmé', date: '2026-11-28', time: '10:00', dureeMin: 60, force: true }));

/* ── 4. Les branchements ── */
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const monte = lis('src/apps/revelateur/monte.tsx');
const genere = lis('scripts/genere-revelateur.mjs');
const site = lis('src/apps/revelateur/ilots/BandeauFermeture.tsx');
const tabs = lis('src/apps/couronne/Tabs.tsx');
const booking = lis('src/apps/couronne/Booking.tsx');
const couronne = lis('src/apps/couronne/FermetureAnnoncee.tsx');
const rdv = lis('src/apps/trone/routes/clients/_shared.tsx');
const sql = lis('supabase/migrations/0167_aucun_rdv_avant_l_ouverture.sql');
dit('le site monte l îlot de la fermeture', true, /fermeture: \(\) => import\('\.\/ilots\/BandeauFermeture'\)/.test(monte));
dit('... sur l accueil et en tête de la réservation (pas sur le rappel)', [true, true],
  [genere.includes('<div data-ilot="fermeture" data-genre="accueil"></div>'), genere.includes(`\${rappel ? '' : '<div data-ilot="fermeture" data-genre="reserver"></div>'}`)]);
dit('... avec les heures de la base et la règle commune', true, /heuresDeLaMaison\(\)/.test(site) && /fermetureAnnoncee\(\{ aujourdhui, semaine, exceptions \}\)/.test(site));
dit('Ma Couronne l annonce sur l accueil et dans la réservation', [true, true], [/<FermetureAnnoncee \/>/.test(tabs), /\{vue < 6 && <FermetureAnnoncee \/>\}/.test(booking)]);
dit('... avec les réglages et les journées exceptionnelles du magasin', true, /useExceptionsHoraires\(\)/.test(couronne) && /semaine: reglages\.hours \?\? \[\]/.test(couronne));
dit('la fenêtre du rendez-vous n offre pas « Poser quand même » à l heure d ouverture', 2, (rdv.match(/raison\.bloque && !raison\.sansPasseDroit && /g) ?? []).length);
dit('le mur en base : avant chaque écriture, la remise à l ouverture, et ce qui est inscrit corrigé', [true, true, true, true],
  [/create trigger pas_avant_l_ouverture\n\s+before insert or update on public\.appointments/.test(sql),
    /if ouvre is null or debut >= ouvre then\n\s+return new;/.test(sql),
    /^update public\.appointments a\n\s+set data = jsonb_set\(a\.data, '\{time\}'/m.test(sql),
    /coalesce\(\(semaine->>'closed'\)::boolean, false\)/.test(sql)]);
dit('... un rituel passé, honoré ou annulé ne se touche pas', true, /in \('annulé', 'honoré'\)/.test(sql) && /if jour < \(now\(\) at time zone 'Africa\/Porto-Novo'\)::date then/.test(sql));

console.log(ko === 0 ? '\nLa fermeture et l heure d ouverture tiennent.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
