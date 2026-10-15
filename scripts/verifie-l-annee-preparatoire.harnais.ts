/* L'ANNÉE PRÉPARATOIRE, ÉPROUVÉE — 15 octobre 2026.

   « Les petites filles de 15 ans qui ne sont plus à l'école et qui
   souhaitent faire une formation à MND… elles sont nombreuses » (Yéman).
   Maquette Ak2z4MUF…, choix cochés : « L'année préparatoire », cinq
   matinées par semaine, 25 000 F d'inscription puis 15 000 F par mois, une
   classe de huit, seulement le métier (le CEP à leur charge), la rentrée de
   janvier 2027, et à 18 ans l'entretien de La Relève directement. Des
   mineures : les parents inscrivent, la direction seule lit.
   Les attentes sont écrites ici à la main, depuis ces choix. */
import { readFileSync } from 'node:fs';
import {
  ANNEE, NOM_DE_LA_PREPARATOIRE, PRIX, RYTHME, TABLE_DE_LA_PREPARATOIRE, classePleine, inscriptionNettoyee, inscriptionVide,
  manqueALInscription, placesPrises, prixDit, totalDeLAnnee, type InscriptionPreparatoire,
} from '../src/shared/preparatoire-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const complete = (x: Partial<InscriptionPreparatoire> = {}): InscriptionPreparatoire => ({
  ...inscriptionVide(),
  parent: { nom: 'F. D.', telephone: '+229 01 00 00 00 00', lien: 'Sa mère' },
  jeune: { prenom: 'A.', nom: 'D.', naissance: '2011-05-02', classe: '5e' },
  pourquoi: 'x'.repeat(80), consentement: true, ...x,
});

/* ── 1. SES CHOIX ── */
dit('le nom', 'L’année préparatoire', NOM_DE_LA_PREPARATOIRE);
dit('rentree le lundi 4 janvier 2027, neuf mois, huit places', ['2027-01-04', 1, 9, 8],
  [ANNEE.rentree, new Date(`${ANNEE.rentree}T12:00:00Z`).getUTCDay(), ANNEE.mois, ANNEE.places]);
dit('cinq matinees par semaine', 'Cinq matinées par semaine', RYTHME);
dit('25 000 F d inscription, 15 000 F par mois : 160 000 F l annee', [25000, 15000, 160000], [PRIX.inscriptionXof, PRIX.moisXof, totalDeLAnnee()]);
dit('... dit en clair', true, prixDit().includes('25 000 F d’inscription, puis 15 000 F par mois pendant 9 mois, soit 160 000 F l’année'));

/* ── 2. L'INSCRIPTION, PAR LE PARENT ── */
dit('une inscription complete peut partir', '', manqueALInscription(complete()));
dit('sans le numero du parent, rien ne part', true, manqueALInscription(complete({ parent: { nom: 'F. D.', telephone: '01', lien: 'Sa mère' } })) !== '');
dit('sans son consentement, rien ne part', true, manqueALInscription(complete({ consentement: false })) !== '');
dit('l age oriente sans refuser : 14 ans, 18 ans passent ; une date impossible se signale', ['', '', true],
  [manqueALInscription(complete({ jeune: { prenom: 'A.', nom: 'D.', naissance: '2012-03-01', classe: '5e' } })),
    manqueALInscription(complete({ jeune: { prenom: 'A.', nom: 'D.', naissance: '2008-03-01', classe: '5e' } })),
    manqueALInscription(complete({ jeune: { prenom: 'A.', nom: 'D.', naissance: '2020-03-01', classe: '5e' } })) !== '']);
dit('une ligne de la boite qui n est pas une inscription se rejette ; le lien se reduit a ce qu on connait', [null, ''],
  [inscriptionNettoyee({ parent: { nom: 'x' } }), inscriptionNettoyee({ ...complete(), parent: { nom: 'F. D.', telephone: '+22901000000', lien: 'voisin' } })?.parent.lien]);

/* ── 3. LA PAGE DU SITE ── */
const site = sansCommentaires(lis('src/apps/academie/Preparatoire.tsx'));
dit('les regles qui la protegent sont dites', [true, true, true, true, true],
  [site.includes('Les parents d’abord'), site.includes('Le matin seulement'), site.includes('Aucun produit chimique'), site.includes('Jamais seule sur une cliente'), site.includes('pas une petite main')]);
dit('le matin, jamais les jours ni le soir', [false, false], [/cinq jours/i.test(site), /le soir/i.test(site)]);
dit('seulement le metier : le CEP se prepare a part', [true, false], [site.includes('Le CEP se prépare à part'), /cours de français|préparer le CEP/i.test(site)]);
dit('a 18 ans, l entretien de La Releve directement', true, site.includes('Elle passe directement à l’entretien de La Relève MND'));
dit('le parent inscrit : ses champs, son consentement', [true, true, true],
  [site.includes('<legend>Vous, son parent</legend>'), site.includes('LIENS.map'), site.includes('Je suis son parent ou son tuteur')]);
dit('la page juge par les regles partagees', true, site.includes('manqueALInscription(i)') && site.includes('deposeLInscription(i, { branchId })'));
dit('la voix de l Academie, sans photo, ni salon, ni tiret cadratin', [false, false, false, false],
  [/la Maison|La Maison|Maison MND/.test(site), /<img\b/.test(site), /salon/i.test(site), site.includes('—')]);
const app = sansCommentaires(lis('src/apps/academie/App.tsx'));
dit('le site de l Academie l ouvre a son adresse et dans sa barre', true,
  app.includes("const ANCRE_DE_LA_PREPARATOIRE = '#annee-preparatoire';") && app.includes('<button type="button" onClick={versLaPreparatoire}>{NOM_DE_LA_PREPARATOIRE}</button>')
  && app.includes("vue === 'preparatoire' ? <Preparatoire branchId={branchId} onRetour={versLAccueil} versLaReleve={versLaReleve} />"));
const depot = sansCommentaires(lis('src/shared/preparatoire.ts'));
dit('le depot ecrit une ligne et ne relit rien', [true, false], [depot.includes('.from(TABLE_DE_LA_PREPARATOIRE).insert({'), /\.select\(/.test(depot)]);

/* ── 4. LA BOÎTE (0131) ── */
const sql = lis('supabase/migrations/0131_la_releve.sql').replace(/--.*$/gm, '');
const politique = (nom: string) => (sql.match(new RegExp(`create policy ${nom} on public\\.preparatoire_inscriptions[^;]*;`)) ?? [''])[0];
dit('la boite est protegee', true, sql.includes('alter table public.preparatoire_inscriptions enable row level security;'));
dit('le public depose seulement une inscription valide', true, /for insert to anon, authenticated\s+with check \(public\.preparatoire_inscription_valide\(data\)\)/.test(politique('prep_deposer')));
dit('seule la direction lit, suit et efface', [true, true, true],
  [/for select to authenticated\s+using \(public\.is_souverain\(\)\)/.test(politique('prep_lire')), /for update to authenticated\s+using \(public\.is_souverain\(\)\) with check \(public\.is_souverain\(\)\)/.test(politique('prep_suivre')), /for delete to authenticated\s+using \(public\.is_souverain\(\)\)/.test(politique('prep_retirer'))]);
dit('le public ne relit ni ne reecrit une mineure', false, /on public\.preparatoire_inscriptions for (select|update|all) to anon/i.test(sql));
dit('la base exige le consentement du parent', true, sql.includes("coalesce(d->'consentement', 'false'::jsonb) = 'true'::jsonb"));
dit('deux demandes du meme numero par jour, 300 dans la boite', [true, true], [sql.includes('preparatoire : ce numero a deja depose aujourd hui'), sql.includes('if n >= 300 then')]);

/* ── 5. AU TRÔNE ── */
const ecran = sansCommentaires(lis('src/apps/trone/routes/equipe/AcademiePreparatoire.tsx'));
dit('l onglet est dans l Academie', true, lis('src/apps/trone/routes/equipe/Academie.tsx').includes("{tab === 'preparatoire' && <AcademiePreparatoire />}"));
dit('seule la direction le lit', true, ecran.includes("if (!souverain) return <p className=\"sad-doux\">"));
const huit = Array.from({ length: 8 }, () => ({ annee: ANNEE.cle, suivi: { statut: 'inscrite' as const } }));
dit('huit inscrites : la classe est pleine, une neuvieme ne s inscrit pas', [8, true, false, true],
  [placesPrises(huit), classePleine(huit), classePleine(huit.slice(1)), ecran.includes("if (suivi.statut === 'inscrite' && l.suivi.statut !== 'inscrite' && lignes && classePleine(lignes))")]);
dit('... les inscrites d une autre annee ne comptent pas', 0, placesPrises([{ annee: '2028-01', suivi: { statut: 'inscrite' } }]));
dit('on efface apres confirmation', true, ecran.includes('if (!await demande({') && ecran.includes('.delete().eq(\'id\', l.id)'));
dit('la table est celle de la migration', 'preparatoire_inscriptions', TABLE_DE_LA_PREPARATOIRE);

console.log(ko ? `\n${ko} ECHEC.` : '\nL annee preparatoire tient ses promesses.');
if (ko) process.exitCode = 1;
