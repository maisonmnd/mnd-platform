/* LES OFFRES DE SAISON, ÉPROUVÉES — `node scripts/verifie-offres-de-saison.mjs`.

   « Faire une offre pour Octobre Rose, Noël, la Saint-Valentin, le mois de la
   femme, le Ramadan, la fête des mères, et que j'aie la possibilité de les
   activer dès qu'on se rapproche de ces dates à 21 jours près » (Yéman,
   18 septembre 2026).

   CE QUI SE JUGE ICI, et surtout LA PROMESSE DE NON-RÉGRESSION : une offre
   SANS dates doit se comporter exactement comme avant ce jour. Des centaines
   d'heures creuses en dépendent dans Ma Couronne. */
import {
  offerLiveNow, etatDeLOffre, dansLaSaison, prochaineOccurrence, saisonsAProposer,
  offreDepuisLaSaison, SAISONS, FENETRE_PROPOSITION, joursEntre, isoDuJour,
  OFFER_DAYS, type InstantOffer,
} from '../src/shared/offers';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Un jeudi, à dix heures : la Maison est ouverte et l'offre pourrait paraître. */
const JEUDI_10H = new Date('2026-10-15T10:00:00');

const base: InstantOffer = {
  id: 'o1', branchId: 'b1', title: 'Test', tag: 'Offre', deal: '−10 %', sub: '',
  audience: 'Tous', days: [...OFFER_DAYS], heureDebut: '08h', heureFin: '20h', active: true,
};

/* ── La promesse de non-régression ──────────────────────────────── */
dit('① une offre SANS dates reste visible, exactement comme avant',
  true, offerLiveNow(base, JEUDI_10H));
dit('② et son état se dit « en cours », sans saison qui la borne',
  'cours', etatDeLOffre(base, JEUDI_10H));
dit('③ sans dates, elle est toujours dans sa saison',
  true, dansLaSaison({}, JEUDI_10H));

/* ── Les bornes, incluses des deux côtés ────────────────────────── */
dit('④ le premier jour compte', true, dansLaSaison({ du: '2026-10-15' }, JEUDI_10H));
dit('⑤ le dernier jour compte aussi', true, dansLaSaison({ au: '2026-10-15' }, JEUDI_10H));
dit('⑥ la veille de l’ouverture, non', false, dansLaSaison({ du: '2026-10-16' }, JEUDI_10H));
dit('⑦ le lendemain de la clôture, non plus', false, dansLaSaison({ au: '2026-10-14' }, JEUDI_10H));

dit('⑧ hors saison, une offre active ne paraît nulle part',
  false, offerLiveNow({ ...base, du: '2026-12-01', au: '2026-12-31' }, JEUDI_10H));
dit('⑨ en saison ET dans sa tranche horaire, elle paraît',
  true, offerLiveNow({ ...base, du: '2026-10-01', au: '2026-10-31' }, JEUDI_10H));
dit('⑩ en saison mais hors tranche horaire, elle ne paraît pas',
  false, offerLiveNow({ ...base, du: '2026-10-01', au: '2026-10-31', heureDebut: '18h', heureFin: '20h' }, JEUDI_10H));

/* ── Les cinq états ─────────────────────────────────────────────── */
const datee = (du: string, au: string, active: boolean) => ({ active, du, au });
dit('⑪ passée', 'passee', etatDeLOffre(datee('2026-09-01', '2026-09-30', true), JEUDI_10H));
dit('⑫ en cours', 'cours', etatDeLOffre(datee('2026-10-01', '2026-10-31', true), JEUDI_10H));
dit('⑬ à venir', 'venir', etatDeLOffre(datee('2026-12-01', '2026-12-31', true), JEUDI_10H));
dit('⑭ à activer, dans la fenêtre des trois semaines',
  'activer', etatDeLOffre(datee('2026-10-25', '2026-10-31', false), JEUDI_10H));
dit('⑮ endormie, encore trop loin',
  'dort', etatDeLOffre(datee('2026-12-01', '2026-12-31', false), JEUDI_10H));
dit('⑯ la frontière des vingt et un jours est INCLUSE',
  'activer', etatDeLOffre(datee('2026-11-05', '2026-11-30', false), JEUDI_10H));
dit('⑰ et le vingt-deuxième jour dort encore',
  'dort', etatDeLOffre(datee('2026-11-06', '2026-11-30', false), JEUDI_10H));

/* ── Une saison revient chaque année ────────────────────────────── */
const rentree = SAISONS.find((s) => s.cle === 'rentree')!;
dit('⑱ la rentrée de septembre, vue en octobre, se reporte à l’an prochain',
  { du: '2027-09-01', au: '2027-09-30' }, prochaineOccurrence(rentree, JEUDI_10H));
const octobre = SAISONS.find((s) => s.cle === 'octobre-rose')!;
dit('⑲ Octobre Rose, vu pendant Octobre Rose, reste sur l’année en cours',
  { du: '2026-10-01', au: '2026-10-31' }, prochaineOccurrence(octobre, JEUDI_10H));

/* ── Ce qui ne se calcule pas ───────────────────────────────────── */
const ramadan = SAISONS.find((s) => s.cle === 'ramadan')!;
dit('⑳ le Ramadan porte des dates inscrites, jamais déduites',
  true, !!ramadan.parAnnee && ramadan.aConfirmer === true);
dit('㉑ une année que la Maison n’a pas datée ne propose rien',
  null, prochaineOccurrence({ cle: 'x', nom: 'X', tag: '', deal: '', sub: '', parAnnee: {} }));
dit('㉒ une saison sans date d’aucune sorte ne propose rien non plus',
  null, prochaineOccurrence({ cle: 'y', nom: 'Y', tag: '', deal: '', sub: '' }));

/* ── La veille de la Maison ─────────────────────────────────────── */
dit('㉓ la fenêtre de veille vaut vingt et un jours', 21, FENETRE_PROPOSITION);

/* CE QUE LA VEILLE DOIT MONTRER, et c'est plus que « ce qui approche ».
   Le 17 septembre, Octobre Rose ouvre dans quatorze jours ET la rentrée
   court déjà depuis seize, sans avoir été posée. LES DEUX se présentent :
   une saison commencée et jamais activée est précisément celle qu'il ne
   faut pas manquer, la Maison peut encore l'ouvrir pour les jours qui
   restent. Le classement va du plus urgent au plus lointain. */
const proposees = saisonsAProposer(SAISONS, [], new Date('2026-09-17T09:00:00'));
dit('㉔ la Maison voit la saison qui approche ET celle qui court déjà',
  ['rentree', 'octobre-rose'], proposees.map((p) => p.saison.cle));
dit('㉕ et elle sait, pour chacune, où elle en est',
  { rentree: -16, 'octobre-rose': 14 },
  Object.fromEntries(proposees.map((p) => [p.saison.cle, p.dans])));

const deja = offreDepuisLaSaison(octobre, { du: '2026-10-01', au: '2026-10-31' }, 'b1', 'of-1');
dit('㉖ une saison déjà posée ne se propose plus, les autres restent',
  ['rentree'], saisonsAProposer(SAISONS, [deja], new Date('2026-09-17T09:00:00')).map((p) => p.saison.cle));

/* ── L offre que la saison fait naître ──────────────────────────── */
dit('㉗ elle naît active, datée, et pour tous les jours',
  { active: true, du: '2026-10-01', au: '2026-10-31', jours: 7, titre: 'Octobre Rose' },
  { active: deja.active, du: deja.du, au: deja.au, jours: deja.days.length, titre: deja.title });
dit('㉘ elle est visible le premier jour de sa saison, à dix heures',
  true, offerLiveNow(deja, new Date('2026-10-01T10:00:00')));
dit('㉙ et plus rien le lendemain de sa clôture',
  false, offerLiveNow(deja, new Date('2026-11-01T10:00:00')));

/* ── Les outils du temps ────────────────────────────────────────── */
dit('㉚ le jour se dit dans la graphie des saisons', '2026-10-15', isoDuJour(JEUDI_10H));
dit('㉛ et l’écart se compte en jours', 14, joursEntre('2026-09-17', '2026-10-01'));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
