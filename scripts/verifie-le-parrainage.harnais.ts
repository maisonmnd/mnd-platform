import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  FORME_DU_CODE, SIGNES_DU_CODE, codeDeMarraine, racineDuCode, lienDuParrainage, lienCourtDuParrainage,
} from '../src/shared/parrainage-pur';
import { codesAAttribuer, soinUtilise, type DemandeParrainee, type FicheLue } from '../src/shared/parrainage';
import {
  lignees, venuesDe, recompensesAPoser, choixReportes, rattachementsDuSite, pourquoiPasDeMarraine,
  resumeDeLAmbassade, classementDuMois, chiffresDuMois, sceauxDuFoyerAPoser, type FicheAmb, type DemandeLue,
} from '../src/shared/ambassade';
import { soinsEnAttente, genreEffectif, rangDe, rangSuivant, type SoinOffert } from '../src/shared/parrainage-pur';
import { venuesDeLAnnee } from '../src/shared/agenda';
import { INGREDIENTS, AVANT_APRES, COMMUNAUTE } from '../src/apps/revelateur/communaute';

/* LA COMMUNAUTÉ MND, ÉPROUVÉE — 28 septembre 2026.

   Ce harnais tient la RÈGLE, pas le cas du jour :

     (1) un code de marraine a TOUJOURS la forme PRENOM-XXX, quel que soit
         le prénom (accents, tirets, vide), et la forme refuse les signes
         ambigus : on l'éprouve dans les deux sens ;
     (2) la fonction Edge porte la MÊME forme et les MÊMES signes que le
         site et le Trône (deux rives, une couture) ;
     (3) la fonction ne donne le cadeau qu'à une nouvelle cliente : elle
         cherche la marraine, le même numéro, un parrainage déjà reçu, une
         fiche existante, et elle ne cherche un code de marraine que si
         AUCUNE offre ne l'a reconnu ;
     (4) le Trône range chaque filleule sous SA marraine, lit la visite dans
         l'agenda, et ne dit un cadeau dû qu'après une visite honorée et
         tant qu'il n'a pas été remis ;
     (5) le site : chaque ingrédient a sa page et sa place au plan, chaque
         motif appelé existe dans public/assets/motifs/ (les patterns réels,
         jamais dessinés), et toute photo d'avant / après ou d'ingrédient
         est inscrite au registre des accords AVANT de sortir.

   Lance : node scripts/verifie-le-parrainage.mjs (après genere-revelateur). */

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── (1) La forme du code ── */
const prenoms = ['Aïcha', 'Sènami', 'Marie-Ève', 'Grâce', '', '  ', 'Ẹ̀bún', 'Jean Baptiste Emmanuel', "N'Deye", '12345'];
const hasards = [() => 0, () => 0.999999, Math.random];
const codes = prenoms.flatMap((p) => hasards.map((h) => codeDeMarraine(p, h)));
dit('chaque code a la forme PRENOM-XXX', [], codes.filter((c) => !FORME_DU_CODE.test(c)));
dit('les accents tombent (Sènami)', 'SENAMI', racineDuCode('Sènami'));
dit('un prénom vide donne MND', 'MND', racineDuCode(''));
dit('six lettres au plus', 'JEANBA', racineDuCode('Jean Baptiste'));
dit('le plus grand hasard reste dans les signes', true, /-[A-Z2-9]{3}$/.test(codeDeMarraine('Ada', () => 0.9999999)));
dit('… et la forme REFUSE un O, un 0, un I, un 1, un L, des minuscules', [false, false, false, false, false, false],
  ['AICHA-7KO', 'AICHA-7K0', 'AICHA-IK2', 'AICHA-1K2', 'AICHA-LK2', 'aicha-7k2'].map((c) => FORME_DU_CODE.test(c)));
dit('… et REFUSE un code d’offre ordinaire', false, FORME_DU_CODE.test('RENTREE10'));
dit('aucun signe ambigu dans l’alphabet', [], [...'O0I1L'].filter((c) => SIGNES_DU_CODE.includes(c)));
dit('le lien partagé pose le code sur la réservation', 'https://exemple.test/reserver/?code=AICHA-7K2', lienDuParrainage('https://exemple.test', 'AICHA-7K2'));

/* ── (2) et (3) La fonction Edge ── */
const edge = readFileSync('supabase/functions/demande-submit/index.ts', 'utf8');
const sansCommentaires = edge.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const signesEdge = /const SIGNES_DU_CODE = '([^']+)'/.exec(sansCommentaires)?.[1];
const formeEdge = /const FORME_DU_CODE = (\/.+\/);/.exec(sansCommentaires)?.[1];
dit('Edge : les mêmes signes', SIGNES_DU_CODE, signesEdge);
dit('Edge : la même forme', String(FORME_DU_CODE), formeEdge);
dit('Edge : le mode parrainage répond avant le genre', true,
  sansCommentaires.indexOf('body.parrainage === true') > -1
  && sansCommentaires.indexOf('body.parrainage === true') < sansCommentaires.indexOf("const genre = String(body.genre"));
dit('Edge : le code de marraine n’est cherché que si aucune offre ne le connaît', true,
  /if \(duCode\.raison === 'inconnu'\) \{\s*duCode = \(await verdictDuParrainage\(/.test(sansCommentaires));
const verdict = sansCommentaires.slice(sansCommentaires.indexOf('async function verdictDuParrainage'), sansCommentaires.indexOf('async function codePourLaMarraine'));
dit('Edge : refuse la marraine elle-même', true, verdict.includes("raison: 'parrainage-soi-meme'"));
dit('Edge : refuse un second parrainage du même numéro', true, verdict.includes("raison: 'parrainage-deja-utilise'"));
dit('Edge : refuse une cliente déjà connue', true, verdict.includes('await dejaCliente(telephone)') && verdict.includes("raison: 'parrainage-deja-cliente'"));
dit('Edge : le cadeau ne se donne qu’en DERNIER, après les trois refus', true,
  verdict.lastIndexOf("raison: 'parrainage'") > verdict.indexOf('await dejaCliente(telephone)'));
dit('Edge : une pause au Trône ferme le parrainage', true, verdict.includes('reglage.actif === false') && sansCommentaires.includes("json({ error: 'parrainage_ferme' }, 409)"));
dit('Edge : la demande garde la marraine', true, /parrainDe: duCode\.code, marraineId: duCode\.marraineId/.test(sansCommentaires));
dit('Edge : la note du rendez-vous dit le cadeau', true, sansCommentaires.includes("v.raison === 'parrainage') return `parrainée par"));
dit('Edge : un même numéro retrouve son code', true, /\.eq\('data->>telephone', telephone\)\.not\('data->>codeParrain', 'is', null\)/.test(sansCommentaires));

/* ── Le site dit chaque issue (la page de réservation) ── */
const reserver = readFileSync('src/apps/revelateur/ilots/Reserver.tsx', 'utf8');
dit('la réservation dit les quatre issues du parrainage', [],
  ['parrainage', 'parrainage-soi-meme', 'parrainage-deja-cliente', 'parrainage-deja-utilise'].filter((r) => !reserver.includes(`recu.codeRaison === '${r}'`)));

const d = (o: Partial<DemandeParrainee> & { id: string }): DemandeParrainee => ({
  genre: 'prospect', createdAt: '2026-10-01T10:00:00Z', branchId: 'b1', prenom: 'X', telephone: '+2290100000000',
  besoin: 'inconnu', source: 'site', consentementLe: '2026-10-01T10:00:00Z', statut: 'nouvelle', ...o,
} as DemandeParrainee);

/* ── (5) Le site servi ── */
const SORTIE = 'revelateur';
const lit = (chemin: string) => {
  const f = `${SORTIE}${chemin}index.html`;
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
};
dit('chaque ingrédient a sa page', [], INGREDIENTS.filter((i) => !lit(`/ingredients/${i.slug}/`)).map((i) => i.slug));
const plan = lit('/plan-du-site/');
dit('… et sa place au plan du site', [], INGREDIENTS.filter((i) => !plan.includes(`/ingredients/${i.slug}/`)).map((i) => i.slug));
const accueil = lit('/');
dit('l’accueil porte la communauté, le parrainage et les ingrédients', [true, true, true],
  ['id="communaute"', 'id="parrainage"', 'id="ingredients"'].map((x) => accueil.includes(x)));
dit('… dans l’ordre voulu : parrainage après la carte cadeau, communauté avant le Journal', true,
  accueil.indexOf('id="offrir"') < accueil.indexOf('id="parrainage"')
  && accueil.indexOf('id="parrainage"') < accueil.indexOf('id="maison"')
  && accueil.indexOf('id="communaute"') < accueil.indexOf('id="journal"'));
dit('l’avant / après ne sort pas tant qu’il n’a pas de paires', AVANT_APRES.length > 0, accueil.includes('id="avant-apres"'));
dit('chaque carte de la communauté mène à une page écrite', [], COMMUNAUTE.cartes.filter((c) => !lit(c.vers)).map((c) => c.vers));
dit('la page testeuse monte le formulaire, profil posé', true, /data-ilot="demande"[^>]*data-profil="Testeuse"/.test(lit('/testeuse/')));
dit('la page parrainage monte l’îlot', true, lit('/parrainage/').includes('data-ilot="parrainer"'));

/* LES PATTERNS RÉELS : tout motif appelé existe. On lit le HTML servi ET la
   feuille, pour qu'un nom de tuile mal tapé ne passe nulle part. */
const feuille = readFileSync('src/apps/revelateur/revelateur.css', 'utf8');
const servis = readdirSync(SORTIE, { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => readFileSync(`${SORTIE}/${f}`, 'utf8')).join('\n');
const appeles = [...new Set([...(feuille + servis).matchAll(/\/assets\/motifs\/([a-z0-9-]+\.png)/g)].map((m) => m[1]))];
dit('au moins les sept motifs de la communauté sont appelés', true, appeles.length >= 7);
dit('… et chaque motif appelé existe dans public/assets/motifs/', [], appeles.filter((f) => !existsSync(`public/assets/motifs/${f}`)));
const communauteCss = feuille.slice(feuille.indexOf('LA COMMUNAUTÉ MND — 28 septembre 2026'));
dit('aucun motif dessiné en CSS dans la communauté (pas de radial en cercles)', false, /radial-gradient\(circle/.test(communauteCss));

/* LES PHOTOS : registre des accords d'abord. */
const registre = readFileSync('docs/site-revelateur/photos.md', 'utf8');
const inscrite = (f: string) => registre.includes('`' + f + '`');
const photosCommunaute = [...AVANT_APRES.flatMap((a) => [a.avant, a.apres]), ...INGREDIENTS.map((i) => i.photo).filter(Boolean) as string[]];
dit('toute photo de l’avant / après ou d’un ingrédient existe', [], photosCommunaute.filter((f) => !existsSync(`public/assets/photos/site/${f}`)));
dit('… et porte sa ligne au registre des accords', [], photosCommunaute.filter((f) => !inscrite(f)));
dit('… et le contrôle du registre CRIE sur une photo non inscrite', false, inscrite('avant-inconnue-000.jpg'));

/* ══ (6) LA CARTE DE CHAQUE CLIENTE — 28 septembre 2026 ═════════════════
   Toute fiche a son code ; un code ne se partage jamais ; le même code sort
   sur tous les postes ; une cliente qui l'avait demandé sur le site le
   garde ; un soin par amie venue, jamais deux ; la caisse le consomme une
   fois ; la base le protège. */
const fiche = (o: Partial<FicheLue> & { id: string }): FicheLue => ({ name: 'Aïcha K.', phone: '+2290100000000', since: '2019-03-01', ...o } as FicheLue);
const foule = Array.from({ length: 60 }, (_, i) => fiche({ id: `c${String(i).padStart(3, '0')}`, name: i % 2 ? 'Aïcha Test' : 'Grâce', phone: `+22901${String(10000000 + i)}` }));
const codesFoule = codesAAttribuer(foule, []);
dit('chaque fiche vivante reçoit un code', 60, codesFoule.length);
dit('… chacun a la forme PRENOM-XXX', [], codesFoule.filter((c) => !FORME_DU_CODE.test(c.code)).map((c) => c.code));
dit('… et aucun ne se répète, même à trente prénoms identiques', 60, new Set(codesFoule.map((c) => c.code)).size);
dit('… et le même code sort sur tous les postes (ordre des fiches indifférent)', JSON.stringify([...codesFoule].sort((a, b) => a.clientId.localeCompare(b.clientId))),
  JSON.stringify([...codesAAttribuer([...foule].reverse(), [])].sort((a, b) => a.clientId.localeCompare(b.clientId))));
dit('… et il vient de son prénom', true, codesFoule.find((c) => c.clientId === 'c001')?.code.startsWith('AICHA-'));
const avecDeja = [fiche({ id: 'x1', codeParrain: 'AICHA-7K2' }), fiche({ id: 'x2', name: 'Aïcha B.', phone: '+2290199999999' }), fiche({ id: 'x3', archived: true, phone: '+2290188888888' })];
const codesDeja = codesAAttribuer(avecDeja, []);
dit('une fiche qui a déjà son code le garde, une fiche archivée n’en reçoit pas', ['x2'], codesDeja.map((c) => c.clientId));
dit('… et le nouveau code évite celui qui existe', true, codesDeja[0]?.code !== 'AICHA-7K2');
const duSite = [d({ id: 'ds1', prenom: 'Rama', telephone: '+2290166666666', codeParrain: 'RAMA-4HX' })];
dit('une cliente qui a demandé son code sur le site GARDE ce code', [{ clientId: 'r1', code: 'RAMA-4HX' }],
  codesAAttribuer([fiche({ id: 'r1', name: 'Rama D.', phone: '01 66 66 66 66' })], duSite));
dit('… mais jamais deux fiches pour un même code du site', 1,
  codesAAttribuer([fiche({ id: 'r1', name: 'Rama D.', phone: '0166666666' }), fiche({ id: 'r2', name: 'Rama E.', phone: '+229 01 66 66 66 66' })], duSite).filter((c) => c.code === 'RAMA-4HX').length);
dit('… et un code neuf n’emprunte jamais celui d’une marraine du site', false,
  codesAAttribuer([fiche({ id: 'z1', name: 'Rama', phone: '+2290155555555' })], duSite).some((c) => c.code === 'RAMA-4HX'));

/* ══ (7) LES AMBASSADRICES — 28 septembre 2026 ══════════════════════════
   La règle, pas le cas : une amie compte UNE fois (site et Trône se
   rejoignent), quand elle est VENUE ; une récompense au choix par amie ;
   l'écho à la deuxième génération et JAMAIS à la troisième ; les rangs et le
   défi ; rien ne se pose deux fois ; le choix de la cliente est reporté ; la
   remise est bornée ; Ma Couronne ne reçoit que des prénoms. */
const fa = (o: Partial<FicheAmb> & { id: string }): FicheAmb => ({ name: 'X', phone: '+2290100000000', since: '2019-01-01', ...o } as FicheAmb);
const ficheA = [
  fa({ id: 'adjoa', name: 'Adjoa Mensah', phone: '+2290170000000', codeParrain: 'ADJOA-7K2' }),
  fa({ id: 'grace', name: 'Grâce H.', phone: '+2290171000000', codeParrain: 'GRACE-9MT', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'ines', name: 'Inès K.', phone: '+2290172000000', codeParrain: 'INES-3PQ', parraineePar: 'GRACE-9MT' }),
  fa({ id: 'lea', name: 'Léa T.', phone: '+2290173000000', codeParrain: 'LEA-2WX', parraineePar: 'INES-3PQ' }),
  fa({ id: 'rama', name: 'Rama D.', phone: '+2290174000000', codeParrain: 'RAMA-4HX', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'zoe', name: 'Zoé A.', phone: '+2290175000000', codeParrain: 'ZOE-8KM', parraineePar: 'ADJOA-7K2' }),
];
const demA: DemandeLue[] = [
  { id: 'd1', prenom: 'Rama', telephone: '+2290174000000', createdAt: '2026-10-01T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a-r' },
  { id: 'd2', prenom: 'Nadia', telephone: '+2290176000000', createdAt: '2026-10-02T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a-n' },
];
const rdvA = [
  { id: 'a-g', status: 'honoré', date: '2026-10-03', clientId: 'grace' },
  { id: 'a-i', status: 'honoré', date: '2026-10-10', clientId: 'ines' },
  { id: 'a-l', status: 'honoré', date: '2026-10-14', clientId: 'lea' },
  { id: 'a-r', status: 'honoré', date: '2026-10-12', clientId: 'rama' },
  { id: 'a-n', status: 'honoré', date: '2026-10-05' },
  { id: 'a-z', status: 'confirmé', date: '2026-10-30', clientId: 'zoe' },
];
const LA = lignees(ficheA, demA, rdvA);
const adjoa = LA.get('ADJOA-7K2')!;
dit('une amie compte UNE fois, même venue par le site ET rattachée au Trône', 1, adjoa.filleules.filter((f) => f.clientId === 'rama').length);
dit('… et garde l’identifiant de sa réservation', 'parr-d1', adjoa.filleules.find((f) => f.clientId === 'rama')?.recompenseId);
dit('Adjoa : quatre amies, dont trois venues (une réservation seule ne compte pas)', [4, 3], [adjoa.filleules.length, venuesDe(adjoa).length]);
const reglageA = { soinMarraineServiceId: 'svc-dandan', remisePct: 20, echoPct: 10, bonusRangs: { tresse: 'svc-signature' }, defi: { actif: true, objectif: 2, serviceId: 'svc-defi' } };
const nomsA = (id: string) => ({ 'svc-dandan': 'DÀNDÀN™', 'svc-signature': 'Le rituel signature', 'svc-defi': 'KLƆKLƆ™' } as Record<string, string>)[id];
const posesA = recompensesAPoser(ficheA, LA, reglageA, '2026-10-20', nomsA);
const idsDe = (id: string) => (posesA.parFiche.get(id) ?? []).map((s) => s.id).sort();
dit('Adjoa : une récompense par amie venue, l’écho d’Inès, le rang Tresse, le défi d’octobre',
  ['defi-2026-10-adjoa', 'echo-parr-c-ines', 'parr-c-grace', 'parr-d1', 'parr-d2', 'rang-tresse-adjoa'], idsDe('adjoa'));
dit('… JAMAIS d’écho à la troisième génération (Léa, amie d’Inès, amie de Grâce)', false, idsDe('adjoa').some((id) => id.includes('lea')));
dit('Grâce : sa récompense pour Inès, et l’écho de Léa', ['echo-parr-c-lea', 'parr-c-ines'], idsDe('grace'));
dit('Inès : sa récompense pour Léa', ['parr-c-lea'], idsDe('ines'));
const parrD1 = (posesA.parFiche.get('adjoa') ?? []).find((s) => s.id === 'parr-d1');
dit('la récompense d’une amie est À CHOISIR, avec son soin et sa remise', { genre: 'a-choisir', serviceId: 'svc-dandan', pct: 20, expireLe: '2027-04-20' },
  { genre: parrD1?.genre, serviceId: parrD1?.serviceId, pct: parrD1?.pct, expireLe: parrD1?.expireLe });
dit('l’écho est une remise plus petite', { genre: 'remise', pct: 10 }, (() => { const e = (posesA.parFiche.get('adjoa') ?? []).find((s) => s.id === 'echo-parr-c-ines'); return { genre: e?.genre, pct: e?.pct }; })());
dit('les réservations du site récompensées sont marquées', ['d1', 'd2'], [...posesA.demandesMarquees].sort());
dit('aucun remerciement tant que la Maison ne l’a pas allumé', 0, posesA.mercis.length);
dit('… et un par amie venue quand elle l’allume', 5, recompensesAPoser(ficheA, LA, { ...reglageA, merciParWhatsApp: true }, '2026-10-20', nomsA).mercis.length);
const ficheApres = ficheA.map((c) => ({ ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...(posesA.parFiche.get(c.id) ?? [])] }));
dit('rien ne se pose deux fois (deux postes, un passage de plus)', 0, recompensesAPoser(ficheApres, lignees(ficheApres, demA, rdvA), reglageA, '2026-10-21', nomsA).parFiche.size);
dit('un cadeau déjà remis à la main ne se repose pas', false,
  (recompensesAPoser(ficheA, lignees(ficheA, [demA[0], { ...demA[1], cadeauMarraineRemisLe: '2026-10-06' }], rdvA), reglageA, '2026-10-20', nomsA).parFiche.get('adjoa') ?? []).some((s) => s.id === 'parr-d2'));
dit('sans prestation choisie, pas de bonus de rang ni de défi (rien ne s’invente)', ['echo-parr-c-ines', 'parr-c-grace', 'parr-d1', 'parr-d2'],
  (recompensesAPoser(ficheA, LA, { remisePct: 20 }, '2026-10-20').parFiche.get('adjoa') ?? []).map((s) => s.id).sort());
dit('la remise ne dépasse jamais la moitié', 50, (recompensesAPoser(ficheA, LA, { remisePct: 80 }, '2026-10-20').parFiche.get('adjoa') ?? [])[0]?.pct);

/* ── Le choix de la cliente ── */
const aChoisir: SoinOffert = { id: 'parr-d1', genre: 'a-choisir', libelle: 'Une récompense à choisir', raison: 'Pour la venue de Rama', poseLe: '2026-10-20', pct: 20, serviceId: 'svc-dandan' };
const dejaUtilisee: SoinOffert = { ...aChoisir, id: 'parr-d2', utiliseLe: '2026-10-21', piece: 'MND-1' };
const choixRemise = choixReportes(fa({ id: 'adjoa', soinsOfferts: [aChoisir, dejaUtilisee], choixRecompenses: { 'parr-d1': { genre: 'remise', produitId: 'p-huile', le: 'x' }, 'parr-d2': { genre: 'soin', le: 'x' } } }), nomsA, (id) => (id === 'p-huile' ? 'L’huile Kòfí™' : undefined));
dit('son choix « remise » est reporté, avec son produit', { genre: 'remise', produitId: 'p-huile', libelle: '−20 % sur L’huile Kòfí™' },
  { genre: choixRemise?.[0].genre, produitId: choixRemise?.[0].produitId, libelle: choixRemise?.[0].libelle });
dit('… une récompense déjà utilisée ne change plus', dejaUtilisee, choixRemise?.[1]);
dit('son choix « soin » prend le nom du soin', 'DÀNDÀN™', choixReportes(fa({ id: 'x', soinsOfferts: [aChoisir], choixRecompenses: { 'parr-d1': { genre: 'soin', le: 'x' } } }), nomsA)?.[0].libelle);
dit('sans choix, rien ne bouge', null, choixReportes(fa({ id: 'x', soinsOfferts: [aChoisir] })));
dit('le genre réel suit son choix', ['a-choisir', 'soin'], [genreEffectif(aChoisir), genreEffectif(aChoisir, { 'parr-d1': { genre: 'soin', le: 'x' } })]);
dit('une récompense expirée n’est plus à utiliser', 0, soinsEnAttente([{ ...aChoisir, expireLe: '2026-10-19' }], '2026-10-20').length);

/* ── Les rangs ── */
dit('les rangs : 0 Graine, 1 Pousse, 3 Tresse, 5 Couronne, 10 Reine', ['graine', 'pousse', 'pousse', 'tresse', 'couronne', 'reine'], [0, 1, 2, 3, 5, 10].map((n) => rangDe(n).id));
dit('… et le suivant', ['pousse', 'couronne', undefined], [0, 3, 10].map((n) => rangSuivant(n)?.id));

/* ── Les deux chemins se rejoignent ── */
const sansLien = ficheA.map((c) => (c.id === 'rama' ? { ...c, parraineePar: undefined } : c));
dit('l’amie venue par le site reçoit le code sur sa fiche', [{ clientId: 'rama', code: 'ADJOA-7K2', le: '2026-10-01T09:00:00Z' }], rattachementsDuSite(sansLien, demA, rdvA));
dit('… une fiche déjà rattachée ne bouge pas', [], rattachementsDuSite(ficheA, demA, rdvA));

/* ── « Vient de la part de » ── */
const nouvelle = fa({ id: 'neuve', name: 'Awa', codeParrain: 'AWA-3JJ' });
dit('« Vient de la part de » : un code inconnu est refusé', true, !!pourquoiPasDeMarraine(nouvelle, 'NULLE-222', ficheA, rdvA));
dit('… son propre code aussi', true, !!pourquoiPasDeMarraine(ficheA[0], 'ADJOA-7K2', ficheA, rdvA));
dit('… une cliente déjà venue plusieurs fois aussi', true,
  !!pourquoiPasDeMarraine(nouvelle, 'ADJOA-7K2', ficheA, [...rdvA, { id: 'v1', status: 'honoré', date: '2026-01-01', clientId: 'neuve' }, { id: 'v2', status: 'honoré', date: '2026-02-01', clientId: 'neuve' }]));
dit('… une nouvelle cliente passe', null, pourquoiPasDeMarraine(nouvelle, 'ADJOA-7K2', [...ficheA, nouvelle], rdvA));
dit('… et une récompense déjà posée ne se déplace plus', true,
  !!pourquoiPasDeMarraine(ficheA[1], 'RAMA-4HX', ficheApres, rdvA));
dit('… même quand elle est venue par le site (récompense de sa réservation)', true,
  !!pourquoiPasDeMarraine(ficheA.find((c) => c.id === 'rama')!, 'GRACE-9MT', ficheApres, rdvA, demA));

/* ── Ce que Ma Couronne reçoit ── */
const resA = resumeDeLAmbassade(adjoa, LA, ficheA, reglageA, '2026-10-20', nomsA);
dit('Ma Couronne : des prénoms, des états, des dates, rien d’autre', [],
  [...resA.filleules.flatMap((f) => Object.keys(f)), ...(resA.echos ?? []).flatMap((e) => Object.keys(e))].filter((k) => !['prenom', 'etat', 'date', 'via'].includes(k)));
dit('… son rang, ses échos, son défi', { rang: 'tresse', venues: 3, echos: ['Inès via Grâce'], defi: { fait: 2, objectif: 2 } },
  { rang: resA.rang, venues: resA.venues, echos: (resA.echos ?? []).map((e) => `${e.prenom} via ${e.via}`), defi: { fait: resA.defi?.fait, objectif: resA.defi?.objectif } });
const clA = classementDuMois(LA, '2026-10-20');
dit('le classement : un prénom, un rang, deux nombres', [], clA.lignes.flatMap((l) => Object.keys(l)).filter((k) => !['prenom', 'rang', 'ceMois', 'amies'].includes(k)));
dit('… Adjoa en tête', 'Adjoa', clA.lignes[0]?.prenom);
dit('les chiffres du mois comptent les amies venues par une amie', 5, chiffresDuMois(ficheA, LA, rdvA, '2026-10-20').parUneAmie);

/* ── La base protège les champs (0111, qui contient 0110) ── */
dit('0110 existe toujours (le premier temps)', true, existsSync('supabase/migrations/0110_la_carte_de_marraine.sql'));
const migration = readFileSync('supabase/migrations/0111_les_ambassadrices.sql', 'utf8');
const sqlSansCommentaires = migration.replace(/--.*$/gm, '');
dit('0111 : l’éditeur SQL et la clé de service gardent la main', true, /if auth\.uid\(\) is null then return new;/.test(sqlSansCommentaires));
dit('0111 : le personnel aussi', true, /if public\.is_staff\(\) then return new;/.test(sqlSansCommentaires));
dit('0111 : le code, le résumé et les soins sont réimposés', true,
  ['codeParrain', 'parrainage', 'soinsOfferts', 'parraineePar', 'parraineeLe'].every((k) => sqlSansCommentaires.includes(`'${k}', old.data -> '${k}'`)));
dit('0111 : son choix entre soin et remise reste à ELLE', false, sqlSansCommentaires.includes("'choixRecompenses'"));
dit('0111 : le classement se lit par les clientes connectées, jamais par le site public', true,
  /create policy docs_ambassade_read on public\.documents for select to authenticated\s+using \(key = 'mnd_classement_ambassade'\)/.test(sqlSansCommentaires)
  && !/docs_ambassade_read[^;]*anon/.test(sqlSansCommentaires));
dit('0111 : le modèle de carte reste libre', false, sqlSansCommentaires.includes("'carteModele'"));
dit('0111 : garde l’insertion comme la mise à jour', true, /before insert or update on public\.clients/.test(sqlSansCommentaires));

/* ── La fonction : la fiche d'abord, le prénom seul ── */
const qui = sansCommentaires.slice(sansCommentaires.indexOf('async function quiOffre'), sansCommentaires.indexOf('async function previensLaMarraine'));
dit('Edge : « qui » ne rend que le prénom et le cadeau, jamais le numéro', true,
  /json\(\{ ok: true, prenom: m\.prenom, cadeau: /.test(qui) && !/telephone/.test(qui.slice(qui.indexOf('json({ ok: true'))));
const duCode = sansCommentaires.slice(sansCommentaires.indexOf('async function marraineDuCode'), sansCommentaires.indexOf('async function verdictDuParrainage'));
dit('Edge : la marraine se cherche parmi les fiches AVANT les demandes', true,
  duCode.indexOf("from('clients')") > -1 && duCode.indexOf("from('clients')") < duCode.indexOf("from('demandes')"));
dit('Edge : une cliente qui demande son code sur le site reçoit celui de sa fiche', true,
  /const saFiche = \(fiches \?\? \[\]\)\.find/.test(sansCommentaires) && sansCommentaires.indexOf('const saFiche') < sansCommentaires.indexOf("const { data: siens }"));
dit('Edge : la marraine n’est prévenue que si le modèle est posé', true, /if \(!MODELE\) return 'sans-modele';/.test(sansCommentaires));

/* ── Le Trône : ce qui écrit, et quand ── */
const hook = readFileSync('src/apps/trone/shell/useParrainageVivant.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('le Trône n’écrit rien avant d’avoir lu fiches, demandes et carnet', true,
  /!tablePrete\('clients'\) \|\| !tablePrete\('demandes'\) \|\| !tablePrete\('appointments'\)/.test(hook));
dit('… ni les soins avant le réglage', true, /if \(!documentDescendu\('mnd_parrainage'\)\) return;/.test(hook));
dit('… et n’envoie que les remerciements que le juge a comptés', true, /for \(const m of poses\.mercis\)/.test(hook) && !/merciParWhatsApp/.test(hook));
dit('… un passage, un geste : chaque étape rend la main après avoir écrit', 5, hook.split('      return;\n    }').length - 1);
dit('le crochet est monté dans le Trône', true, /useParrainageVivant\(\);/.test(readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8')));
const caisse = readFileSync('src/apps/trone/routes/vente/Caisse.tsx', 'utf8');
dit('la caisse ne consomme le soin qu’à l’encaissement, ligne encore offerte, avec la pièce', true,
  /if \(soinPose && clientId && cart\[soinPose\.cle\]\?\.disc === soinPose\.disc\)/.test(caisse) && /soinUtilise\(c\.soinsOfferts, idSoin, inv\.number, dateVente, \{ genre \}\)/.test(caisse));
const envoi = readFileSync('supabase/functions/whatsapp-envoi/index.ts', 'utf8');
dit('whatsapp-envoi sait porter une image en en-tête', true, /\{ type: 'image', image: \{ id: mediaId \} \}/.test(envoi));

/* ── La carte : le QR mène à la réservation, le logo n'est pas déformé ── */
const peinture = readFileSync('src/ds/carte-marraine.ts', 'utf8');
dit('le QR porte le lien de la carte, code posé', true, /qr\.addData\(lienDeLaCarte\(d\.code\)\)/.test(peinture));
dit('… le lien COURT, celui que la marraine partage (7 octobre 2026)', true, /lienDeLaCarte = \(code: string\): string => lienCourtDuParrainage\(ORIGINE_DU_SITE, code\)/.test(peinture));

/* ── LE LIEN COURT — 7 octobre 2026 (« lien court pour la carte des
   ambassadrices ») : maisonmnd.com/m/?CODE, dans le QR, écrit sur la carte,
   dans le message, derrière « Copier mon lien ». ── */
dit('le lien court pose le code après /m/?', 'https://exemple.test/m/?AICHA-7K2', lienCourtDuParrainage('https://exemple.test', 'AICHA-7K2'));
dit('… plus court que le long', true, lienCourtDuParrainage('https://maisonmnd.com', 'AICHA-7K2').length < lienDuParrainage('https://maisonmnd.com', 'AICHA-7K2').length);
dit('… écrit en clair sur la carte, à la place du seul domaine', true, /espace\(c, lienDeLaCarteEcrit\(d\.code\)/.test(peinture));
dit('… et dans le message de partage', true, /\\n\$\{lienDeLaCarte\(d\.code\)\}`;/.test(peinture));
const carteCouronne = readFileSync('src/apps/couronne/MaCarte.tsx', 'utf8');
dit('Ma Couronne copie le lien court', true, /navigator\.clipboard\.writeText\(lienDeLaCarte\(donnees\.code\)\)/.test(carteCouronne) && /t\('Copier mon lien'\)/.test(carteCouronne));
dit('… et le dit en anglais', true, /'Copier mon lien': 'Copy my link'/.test(readFileSync('src/apps/couronne/i18n/en-formule.ts', 'utf8')));
const generateur = readFileSync('scripts/genere-revelateur.mjs', 'utf8');
const formeCopiee = /const FORME_DU_CODE_COURT = '([^']+)';/.exec(generateur);
dit('la page /m/ reconnaît le code avec la MÊME forme que le parrainage', FORME_DU_CODE.source, formeCopiee?.[1]);
dit('… la page /m/ est écrite, hors des moteurs, hors du plan', [true, true, false], [
  /writeFileSync\(path\.join\(SORTIE, 'm', 'index\.html'\), page\(\{\s*chemin: '\/m\/'/.test(generateur),
  /chemin: '\/m\/'[\s\S]{0,2500}\.replace\('<link rel="canonical"', '<meta name="robots" content="noindex" \/><link rel="canonical"'\)\);/.test(generateur),
  /pagesEcrites\.push\('\/m\/'\)/.test(generateur),
]);
dit('… et le plan du site saute les pages noindex', true, /\.filter\(\(rel\) => !\/<meta name="robots" content="noindex"\/\.test\(readFileSync/.test(readFileSync('scripts/build-sites.mjs', 'utf8')));
dit('le site partage le lien court, lui aussi', true, /base\('\/m\/'\)\}\?\$\{encodeURIComponent\(code\)\}/.test(readFileSync('src/apps/revelateur/ilots/Parrainer.tsx', 'utf8')));
const tailleDuPng = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const [vw, vh] = tailleDuPng('public/assets/verrous/verrou-couche-ivoire.png');
const verrou = /drawImage\(clair \? vIndigo : vIvoire, \d+, \d+, (\d+), (\d+)\)/.exec(peinture);
dit('le verrou couché garde ses proportions (1 %)', true, !!verrou && Math.abs(Number(verrou[1]) / Number(verrou[2]) - vw / vh) / (vw / vh) < 0.01);
dit('… et reste au-dessus de son plancher de 123 px', true, !!verrou && Number(verrou[1]) >= 123);
const vb = /viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(readFileSync('public/assets/vectoriel/pictogramme-cuivre.svg', 'utf8'));
const picto = /drawImage\(picto, \d+, \d+, (\d+), (\d+)\)/.exec(peinture);
dit('le pictogramme garde ses proportions (1 %)', true, !!vb && !!picto && Math.abs(Number(picto[1]) / Number(picto[2]) - Number(vb[1]) / Number(vb[2])) / (Number(vb[1]) / Number(vb[2])) < 0.01);
dit('… et chaque motif que la carte peint existe', [],
  [...peinture.matchAll(/M\('([a-z0-9-]+\.png)'\)/g)].map((m) => m[1]).filter((f) => !existsSync(`public/assets/motifs/${f}`)));

/* ══ (8) LE CERCLE RÉUNI — 29 septembre 2026 ═════════════════════════════
   Un sceau du Foyer atteint devient une récompense, une fois ; les points
   ont quitté le Cercle (ni gain ni retrait possible à l'écran, plus de
   compteur dans Ma Couronne) ; un seul écran au Trône. */
const foyersT = [{ famId: 'fam1', nom: 'Famille A.', payeurId: 'adjoa', depense: 450000 }, { famId: 'fam2', nom: 'Famille B.', payeurId: 'grace', depense: 100000 }];
const sceauxT = [{ id: 's1', seuilXof: 300000, serviceId: 'svc-dandan' }, { id: 's2', seuilXof: 600000, serviceId: 'svc-signature' }, { id: 's3', seuilXof: 200000, serviceId: '' }];
const posesF = sceauxDuFoyerAPoser(foyersT, sceauxT, ficheA, '2026-10-20', 6, nomsA);
dit('un sceau du Foyer atteint pose UN soin sur la fiche de celle qui règle', ['foyer-s1-fam1'], (posesF.get('adjoa') ?? []).map((s) => s.id));
dit('… un palier non atteint, ou sans soin choisi, ne pose rien', [false, false], [posesF.has('grace'), (posesF.get('adjoa') ?? []).some((s) => s.id.includes('s3'))]);
dit('… et la reposer ne la double pas', 0, sceauxDuFoyerAPoser(foyersT, sceauxT, ficheA.map((c) => (c.id === 'adjoa' ? { ...c, soinsOfferts: posesF.get('adjoa') } : c)), '2026-10-21', 6, nomsA).size);
dit('… c’est un soin, source foyer, avec sa date de fin', { genre: 'soin', source: 'foyer', expireLe: '2027-04-20' },
  (() => { const s = (posesF.get('adjoa') ?? [])[0]; return { genre: s?.genre, source: s?.source, expireLe: s?.expireLe }; })());
const onglets = readFileSync('src/apps/couronne/Tabs.tsx', 'utf8');
const cercleTab = onglets.slice(onglets.indexOf('export function CercleTab('), onglets.indexOf('/* ================= PROFIL'));
dit('Ma Couronne : l’onglet du Cercle porte l’ambassade', true, cercleTab.includes('<MonAmbassade toast={toast} />'));
dit('… et plus de points, ni de bouton « Introduire » qui n’envoyait rien', [false, false, false],
  [/loyaltyPoints/.test(cercleTab), /points de reconnaissance/.test(cercleTab), /Introduire par WhatsApp/.test(cercleTab)]);
dit('… l’accueil ne compte plus de points', false, /loyaltyPoints/.test(onglets));
const cercleTrone = readFileSync('src/apps/trone/routes/equipe/Cercle.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('Trône : le Cercle porte l’onglet des ambassadrices', true, cercleTrone.includes('<Parrainages dansLeCercle />'));
dit('… et n’écrit plus aucun point (ni don, ni ajustement)', false, /loyaltyPoints\s*:/.test(cercleTrone) || /setHistory|setPointsOn/.test(cercleTrone));
const nav = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
dit('… une seule entrée au menu : l’écran des ambassadrices seul sort de la barre', true,
  /path: '\/parrainages', horsMenu: true/.test(nav) && /path: '\/cercle', label: 'Le Cercle MND'/.test(nav));
dit('le Trône pose les sceaux du Foyer en tâche de fond', true, /sceauxDuFoyerAPoser\(foyers, sceaux, clients/.test(hook));

/* ══ (9) LES VENUES DE L'ANNÉE — 29 septembre 2026 ═══════════════════════
   « Calcule les venues par an, pas de cumul » : le Cercle se compte sur les
   douze derniers mois glissants ; un jour compte une fois ; ni une venue
   vieille de plus d'un an, ni un rendez-vous à venir, ni celui d'une autre. */
const rdvAn = [
  { status: 'honoré', clientId: 'x', date: '2026-09-28' },
  { status: 'honoré', clientId: 'x', date: '2026-09-28' },
  { status: 'honoré', clientId: 'x', date: '2026-03-02' },
  { status: 'honoré', clientId: 'x', date: '2025-09-30' },
  { status: 'honoré', clientId: 'x', date: '2025-09-29' },
  { status: 'honoré', clientId: 'x', date: '2024-05-01' },
  { status: 'honoré', clientId: 'x', date: '2026-10-05' },
  { status: 'confirmé', clientId: 'x', date: '2026-08-01' },
  { status: 'honoré', clientId: 'y', date: '2026-08-01' },
];
dit('les venues comptent sur douze mois glissants, un jour une fois', 3, venuesDeLAnnee(rdvAn, 'x', '2026-09-29'));
dit('… le 1ᵉʳ janvier ne remet rien à zéro', venuesDeLAnnee(rdvAn, 'x', '2026-12-31') >= 2, true);
dit('… et l’an d’avant se compte à part', 2, venuesDeLAnnee(rdvAn, 'x', '2025-10-01'));
const statutSrc = readFileSync('src/shared/accounts.ts', 'utf8');
dit('le statut du Cercle (Ma Couronne, la fiche) compte l’année, pas le cumul', true, /const venues = venuesDeLAnnee\(appts, client\.id\);/.test(statutSrc));
dit('… les deux écrans du Cercle aussi', [true, true],
  [/venuesDeLAnnee\(appts, c\.id\)/.test(readFileSync('src/apps/trone/routes/equipe/Cercle.tsx', 'utf8')), /estDuCercle\(venuesDeLAnnee\(rdvs, c\.id\), seuilCercle\)/.test(readFileSync('src/apps/trone/routes/equipe/Parrainages.tsx', 'utf8'))]);

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} échec(s).`);
if (ko) process.exit(1);
