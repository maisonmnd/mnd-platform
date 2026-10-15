/* LA RELÈVE MND, ÉPROUVÉE — 15 octobre 2026.

   « Nous recherchons et formons des élites » (Yéman). Maquette DPakEb4g…,
   choix cochés et donnés au sélecteur le 15 octobre 2026 :
   - le nom « La Relève MND », la page sur le site de l'Académie ;
   - deux ans avec une expérience, trois ans pour une débutante ;
   - le CEP au moins ; le public « jeunes femmes de 18 à 23 ans » DIT, jamais
     appliqué (Code du travail, art. 4) ;
   - la disponibilité : « disponible pour deux ans » ou « pour trois ans »,
     ni « pas disponible », ni « cinq jours sur sept » ;
   - d'abord un parcours payant : la Fondation, après l'entretien, à la place
     de la semaine d'immersion, que l'essai pratique clôt ;
   - une allocation de 15 000, 25 000, 35 000 F ; une promotion de quatre ;
     candidatures jusqu'au 31 janvier 2027, rentrée en avril 2027 ;
   - une boîte que le public remplit sans jamais la relire, et que seule la
     direction vide ; le contrat d'apprentissage au Secrétariat, privé.

   Les attentes sont écrites ici à la main, depuis ces choix. */
import { readFileSync } from 'node:fs';
import {
  ALLOCATIONS_PROPOSEES, GRILLE, NOM_DE_LA_RELEVE, PROMOTION, SEUIL_DE_LA_RELEVE, TABLE_DE_LA_RELEVE,
  allocationDite, allocationsDe, candidaturesOuvertes, contratPossible, dossierNettoye, dossierVide, grilleComplete,
  idDeLaCandidatureReleve, manqueAuDossier, manqueAuPas, parcoursDEntree, parcoursPropose, remplisLeContratDApprentissage,
  totalDeLaGrille, type DossierReleve,
} from '../src/shared/releve-pur';
import { modeleDe } from '../src/shared/secretariat-modeles';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}');
const sansCommentairesSql = (s: string) => s.replace(/--.*$/gm, '');

/* Un dossier complet, aux initiales. */
const phrase = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');
const complet = (x: Partial<DossierReleve> = {}): DossierReleve => ({
  ...dossierVide(),
  prenom: 'A.', nom: 'K.', naissance: '2005-03-14', quartier: 'Fidjrossè, Cotonou', telephone: '+229 01 00 00 00 00',
  classe: '3e', diplome: 'BEPC', langues: ['Français'], deja: 'non', gestes: ['Rien encore'],
  motivations: { coiffure: 'x'.repeat(90), maison: 'x'.repeat(90), cinqAns: 'x'.repeat(70) },
  raisons: { qualite: 'x'.repeat(70), difficulte: 'x'.repeat(70) },
  disponibilite: 'trois-ans', lettre: phrase(200), engagements: { tenue: true, lettre: true, garde: true },
  ...x,
});

/* ── 1. LE NOM, LA PROMOTION, LES DATES ── */
dit('le programme s appelle La Releve MND', 'La Relève MND', NOM_DE_LA_RELEVE);
dit('promotion d avril 2027, candidatures jusqu au 31 janvier 2027, quatre places', ['avril 2027', '2027-01-31', 4], [PROMOTION.dit, PROMOTION.jusquau, PROMOTION.places]);
dit('le formulaire s ouvre jusqu au 31 janvier 2027 inclus, et se ferme le lendemain', [true, true, false],
  [candidaturesOuvertes('2026-10-15'), candidaturesOuvertes('2027-01-31'), candidaturesOuvertes('2027-02-01')]);

/* ── 2. LE QUESTIONNAIRE ── */
dit('un dossier complet peut partir', '', manqueAuDossier(complet()));
dit('l age ne refuse JAMAIS (art. 4) : 16 ans, 25 ans, 30 ans passent', ['', '', ''],
  [manqueAuPas(complet({ naissance: '2010-06-01' }), 0), manqueAuPas(complet({ naissance: '2001-06-01' }), 0), manqueAuPas(complet({ naissance: '1996-06-01' }), 0)]);
dit('... seule une date impossible se signale (moins de 14 ans, art. 66)', true, manqueAuPas(complet({ naissance: '2020-01-01' }), 0) !== '');
dit('le sexe ne se demande pas : aucun champ dans le dossier', false, Object.keys(complet()).some((k) => /sexe|genre|civilit/i.test(k)));
dit('le CEP au moins : « Aucun » ne part pas, le CEP passe', [true, ''],
  [/CEP/.test(manqueAuPas(complet({ diplome: 'Aucun' }), 1)), manqueAuPas(complet({ diplome: 'CEP' }), 1)]);
dit('la disponibilite se dit pour deux ans ou pour trois ans', ['', '', true],
  [manqueAuPas(complet({ disponibilite: 'deux-ans' }), 4), manqueAuPas(complet({ disponibilite: 'trois-ans' }), 4), manqueAuPas(complet({ disponibilite: '' }), 4) !== '']);
dit('... et rien d autre ne survit au nettoyage', ['', 'deux-ans'],
  [dossierNettoye({ ...complet(), disponibilite: 'partielle' })?.disponibilite, dossierNettoye({ ...complet(), disponibilite: 'deux-ans' })?.disponibilite]);
dit('la lettre : 150 mots au moins, 400 au plus', [true, '', true],
  [manqueAuPas(complet({ lettre: phrase(149) }), 5) !== '', manqueAuPas(complet({ lettre: phrase(150) }), 5), manqueAuPas(complet({ lettre: phrase(401) }), 5) !== '']);
dit('une motivation de deux mots ne passe pas', true, manqueAuPas(complet({ motivations: { coiffure: 'Parce que', maison: 'x'.repeat(90), cinqAns: 'x'.repeat(70) } }), 3) !== '');
dit('sans le consentement, rien ne part', true, manqueAuDossier(complet({ engagements: { tenue: true, lettre: true, garde: false } })) !== '');
dit('une ligne de la boite qui n est pas un dossier se rejette', [null, null], [dossierNettoye('du texte'), dossierNettoye({ prenom: 'A.' })]);
dit('... et une liste inventee se reduit a ce qu on connait', ['Fon'], dossierNettoye({ ...complet(), langues: ['Fon', '<script>'] })?.langues);

const site = sansCommentaires(lis('src/apps/academie/LaReleve.tsx'));
dit('la page dit deux reponses de disponibilite, et pas les jours', [true, true, false, false, false],
  [site.includes('Disponible pour deux ans'), site.includes('Disponible pour trois ans'), /cinq jours/i.test(site), /Pas enti[eè]re/i.test(site), /pas disponible/i.test(site)]);
dit('la page juge par les regles partagees, pas par les siennes', true,
  site.includes('manqueAuPas(d, pas)') && site.includes('manqueAuDossier(d)') && site.includes("deposeLeDossier(d, { branchId, page: '/academie/#la-releve' })"));
dit('la page dit le public vise sans le demander (pas de civilite, pas de sexe)', [true, false],
  [site.includes('s’adresse aux jeunes femmes de {AGE_VISE.min} à {AGE_VISE.max} ans'), /civilit|sexe/i.test(site)]);
dit('aucune photo sur la page', false, /<img\b/.test(site));
dit('la page parle au nom de l Academie, jamais de « la Maison » (charte du 7 octobre 2026)', false, /la Maison|La Maison|Maison MND/.test(site));
dit('ni « salon », ni tiret cadratin dans ce que la page dit', [false, false], [/salon/i.test(site), site.includes('—')]);
const app = sansCommentaires(lis('src/apps/academie/App.tsx'));
dit('le site de l Academie ouvre La Releve a son adresse et dans sa barre', true,
  app.includes("const ANCRE_DE_LA_RELEVE = '#la-releve';") && app.includes('<button type="button" onClick={versLaReleve}>{NOM_DE_LA_RELEVE}</button>')
  && app.includes("{vue === 'releve' ? <LaReleve branchId={branchId} onRetour={versLAccueil} /> : ("));
const depot = sansCommentaires(lis('src/shared/releve.ts'));
dit('le depot ecrit une ligne et ne relit rien', [true, false], [depot.includes('.from(TABLE_DE_LA_RELEVE).insert({'), /\.select\(/.test(depot)]);

/* ── 3. D'ABORD UN PARCOURS PAYANT : LA FONDATION ── */
const f = parcoursDEntree();
dit('la Fondation est le parcours d entree, pour debutante', ['fondation', 'debutante'], [f?.id, f?.public]);
dit('la page dit son prix depuis la semence des parcours, pas un chiffre recopie', [true, false],
  [site.includes('nombreEnChiffres(FONDATION.prixXof)'), /150[\s  ]?000/.test(site)]);
dit('la Fondation remplace la semaine d immersion dans la grille', [true, false], [GRILLE.some((g) => g.cle === 'fondation'), GRILLE.some((g) => /immersion/i.test(g.dit))]);
dit('la page ne promet plus « aucun frais » partout', false, /Aucun frais, à aucune étape/.test(site));

/* ── 4. LA GRILLE SUR 100 ── */
dit('la grille fait 100 points, seuil 70', [100, 70], [GRILLE.reduce((t, g) => t + g.sur, 0), SEUIL_DE_LA_RELEVE]);
const pleines = { dossier: 18, appel: 8, entretien: 20, fondation: 15, essai: 20 };
dit('le total, borne a chaque note', [81, 100], [totalDeLaGrille(pleines), totalDeLaGrille({ dossier: 99, appel: 99, entretien: 99, fondation: 99, essai: 99 })]);
dit('le contrat ne se prepare qu une grille complete, au seuil', [true, false, false],
  [contratPossible(pleines, 70), contratPossible({ ...pleines, essai: 5 }, 70), contratPossible({ dossier: 20, appel: 10, entretien: 25, essai: 25 }, 70)]);
dit('... une grille a laquelle manque une note n est pas complete', false, grilleComplete({ dossier: 20 }));
dit('deux ans avec un apprentissage termine ou un CQM, trois pour une debutante', [2, 2, 3],
  [parcoursPropose({ deja: 'termine', diplome: 'BEPC' }), parcoursPropose({ deja: 'non', diplome: 'CQM ou CQP' }), parcoursPropose({ deja: 'non', diplome: 'CEP' })]);

/* ── 5. L'ALLOCATION ET LE CONTRAT ── */
dit('l allocation proposee : 15 000, 25 000, 35 000 F', [15000, 25000, 35000], [...ALLOCATIONS_PROPOSEES]);
dit('... un reglage incomplet ne remplace rien', [15000, 25000, 35000], allocationsDe({ allocations: [20000] }));
dit('... dite par annee, sur trois ans ou sur deux', [true, true, false],
  [allocationDite(ALLOCATIONS_PROPOSEES, 3).includes('35 000 F'), allocationDite(ALLOCATIONS_PROPOSEES, 2).includes('25 000 F'), allocationDite(ALLOCATIONS_PROPOSEES, 2).includes('35 000')]);
const m = modeleDe('contrat-apprentissage');
dit('le modele existe, aux Contrats, a faire relire', ['contrat-apprentissage', 'contrats', true], [m.cle, m.famille, m.aRelire]);
dit('il suit le Code : art. 64 a 70, quatre exemplaires, inspecteur, visa, parents', [true, true, true, true, true],
  [m.corps.includes('articles 64 à 70'), m.corps.includes('quatre exemplaires'), m.corps.includes('autorisation préalable de l’inspecteur du travail'), m.corps.includes('au visa des services du ministère chargé du travail'), m.corps.includes('Père, mère ou tuteur')]);
const rempli = remplisLeContratDApprentissage(m.corps, { nomEntier: 'A. K.', naissance: '2005-03-14', domicile: 'Fidjrossè, Cotonou', duree: 3, allocations: ALLOCATIONS_PROPOSEES });
dit('rempli depuis le dossier : nom, naissance avec l annee, domicile, duree, allocation', [true, true, true, true, true],
  [rempli.includes('Et A. K., née le 14 mars 2005, demeurant à Fidjrossè, Cotonou'), !rempli.includes('[DATE DE NAISSANCE]'), rempli.includes('conclu pour trois ans'), rempli.includes('15 000 F par mois la première année'), rempli.includes('35 000 F la troisième')]);
dit('... ce que la main doit ecrire reste entre crochets', true,
  ['[DATE DE DÉBUT]', '[ADRESSE]', '[JOUR DU VERSEMENT]', '[NOM, PRÉNOMS, PROFESSION, ÂGE ET DOMICILE DU PÈRE, DE LA MÈRE OU DU TUTEUR]'].every((x) => rempli.includes(x)));
dit('la proposition d embauche est sans obligation', true, m.corps.includes('ni l’une ni l’autre n’y est tenue'));
const contrat = sansCommentaires(lis('src/apps/trone/routes/equipe/rh/contrat-releve.ts'));
dit('le contrat se prepare prive, au modele de La Releve', true,
  contrat.includes("modele: 'contrat-apprentissage'") && contrat.includes('metsAJour(p, { prive: true, corps: remplisLeContratDApprentissage(p.corps, v) })'));

/* ── 6. LA BOÎTE (0131) ── */
const sql = sansCommentairesSql(lis('supabase/migrations/0131_la_releve.sql'));
const politique = (nom: string) => (sql.match(new RegExp(`create policy ${nom} on public\\.releve_candidatures[^;]*;`)) ?? [''])[0];
dit('la boite est protegee', true, sql.includes('alter table public.releve_candidatures enable row level security;'));
dit('le public y depose seulement un dossier valide', true, /for insert to anon, authenticated\s+with check \(public\.releve_dossier_valide\(data\)\)/.test(politique('releve_deposer')));
dit('seule la direction lit et efface', [true, true], [/for select to authenticated\s+using \(public\.is_souverain\(\)\)/.test(politique('releve_lire')), /for delete to authenticated\s+using \(public\.is_souverain\(\)\)/.test(politique('releve_retirer'))]);
dit('personne ne reecrit un dossier, le public ne relit rien', [false, false], [/for update/i.test(sql), /for (select|all) to anon/i.test(sql)]);
const valide = (sql.match(/create or replace function public\.releve_dossier_valide[\s\S]*?\$\$;/) ?? [''])[0];
dit('la base refuse « Aucun » diplome, une lettre hors bornes, sans consentement', [true, true, true],
  [valide.includes("not in ('', 'Aucun')"), valide.includes('between 120 and 520'), valide.includes("d->'engagements'->'garde'")]);
dit('la base ne regarde ni l age ni le sexe', false, /\b(age|sexe|genre)\b|years|date_part|extract\(/i.test(valide));
dit('deux depots du meme numero par jour, 400 dans la boite', [true, true], [sql.includes('if n >= 2 then'), sql.includes('if n >= 400 then')]);

/* ── 7. LE TRÔNE VIDE LA BOÎTE DANS LE RECRUTEMENT ── */
const crochet = sansCommentaires(lis('src/apps/trone/shell/useLaReleveArrive.ts'));
dit('le crochet est monte, et ne sert que la direction', [true, true],
  [lis('src/apps/trone/shell/Shell.tsx').includes('  useLaReleveArrive();\n'), crochet.includes("if (!session || !souverain || !supabase || !tablePrete('rh')) return;")]);
dit('l identifiant vient de la boite : deux postes ne font pas deux candidatures', ['rh-can-releve-rel-1', true],
  [idDeLaCandidatureReleve('rel-1'), crochet.includes('const id = idDeLaCandidatureReleve(r.id);')]);
const lecture = crochet.indexOf(".from('rh').select('id').in('id', ids)");
const effacement = crochet.indexOf('.from(TABLE_DE_LA_RELEVE).delete()');
dit('la boite ne se vide que de ce que le serveur tient deja', [true, true],
  [lecture > 0 && effacement > lecture, crochet.includes('lignes.filter((r) => auServeur.has(idDeLaCandidatureReleve(r.id))).map((r) => r.id)')]);
const recrutement = sansCommentaires(lis('src/apps/trone/routes/equipe/rh/Recrutement.tsx'));
dit('au Recrutement : le dossier, la grille, le bouton du contrat ferme sous le seuil', [true, true, true],
  [recrutement.includes('{releve && <DossierDeLaReleve releve={releve} />}'), recrutement.includes('const possible = !!releve && contratPossible(notes, seuil);'), recrutement.includes('disabled={!possible} onClick={preparerLeContrat}')]);
dit('les reglages RH tiennent l allocation et le seuil', true, lis('src/apps/trone/routes/equipe/rh/Obligations.tsx').includes('regle({ releve: { ...(r.releve ?? {}), allocations: a } });'));
dit('la table du depot est celle de la migration', 'releve_candidatures', TABLE_DE_LA_RELEVE);

console.log(ko ? `\n${ko} ECHEC.` : '\nLa Releve tient ses promesses.');
if (ko) process.exitCode = 1;
