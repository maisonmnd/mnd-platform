/* LE CLUB DES PETITES COURONNES, ÉPROUVÉ — `node scripts/verifie-le-club.mjs`.

   La règle du Club (src/shared/club-pur.ts) telle que Yéman l'a choisie le
   21 octobre 2026 : un cauris par venue honorée, Kids par sa prestation ou par
   l'âge (15 ans ou moins) ; un collier de dix, paliers 1, 3, 6 et 10 ; les
   visites passées comptent, mais des paliers atteints avant le Club seul le
   plus haut donne un cadeau ; un cadeau remis garde son premier jour ;
   l'anniversaire de couronne part de la Première Couronne Kids, un an au
   moins. Chaque épreuve porte la RÈGLE dite, jamais ce que le code en fait.

   Tout est inventé. Sortie ASCII : la console de Windows. */
import {
  releveDuClub, caurisDuRdv, caurisDe, estUneVenueDuClub, ageAuJour, phraseDuPalier, cadeauxApresRemise,
  CLUB_DEPUIS, COLLIER, PALIERS_DU_CLUB, CATEGORIE_KIDS, PREMIERE_COURONNE_KIDS,
  type RdvDuClub, type ServiceDuClub, type FicheDuClub,
} from '../src/shared/club-pur';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lis = (p: string): string => readFileSync(p, 'utf8');
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── Le catalogue réduit : deux prestations Kids, une de la Maison ── */
const SERVICES = new Map<string, ServiceDuClub>([
  ['sv-kids-sinsin', { id: 'sv-kids-sinsin', categoryId: 'cat-mnd-kids' }],
  ['sv-kids-kloklo', { id: 'sv-kids-kloklo', categoryId: 'cat-mnd-kids' }],
  ['sv-kids-vekpe', { id: 'sv-kids-vekpe', categoryId: 'cat-mnd-kids' }],
  ['sv-maison', { id: 'sv-maison', categoryId: 'cat-gbeji' }],
]);
let k = 0;
const rdv = (clientId: string, date: string, serviceIds: string[], status = 'honoré'): RdvDuClub =>
  ({ id: `r${++k}`, clientId, date, time: '10:00', status, serviceIds });
const ENFANT: FicheDuClub = { id: 'enf', birthday: '2017-05-10' };
const ADULTE: FicheDuClub = { id: 'adu', birthday: '1990-02-01' };
const jour = '2026-10-21';
const releve = (fiche: FicheDuClub, appts: RdvDuClub[], j = jour) => releveDuClub({ jour: j, fiche, appts, services: SERVICES });

/* ── 0. Les constantes que Yéman a dites ── */
dit('le Club commence le 21 octobre 2026', '2026-10-21', CLUB_DEPUIS);
dit('un collier de dix cauris', 10, COLLIER);
dit('les paliers : 1, 3, 6 et 10 cauris', [1, 3, 6, 10], PALIERS_DU_CLUB.map((p) => p.cauris));
dit('les noms des paliers', ['Bienvenue', 'Le premier rang', 'La moitié du collier', 'Petite Couronne'], PALIERS_DU_CLUB.map((p) => p.nom));
/* Les cadeaux revus par Yéman au sélecteur le 21 octobre 2026. */
dit('les cadeaux, dits a l enfant (tu)', ['le cordon, le carnet et l’écusson du Club', 'un bonnet de nuit en satin à ta taille', 'la trousse « Mon kit de couronne »', 'le cauris d’or, le diplôme et ta photo dans le carnet'],
  PALIERS_DU_CLUB.map((p) => p.cadeauPourToi));
dit('les cadeaux, dits aux parents et a la Maison', ['le cordon, le carnet et l’écusson du Club', 'un bonnet de nuit en satin à sa taille', 'la trousse « Mon kit de couronne »', 'le cauris d’or, le diplôme et sa photo dans le carnet'],
  PALIERS_DU_CLUB.map((p) => p.cadeau));
const kidsTs = lis('src/shared/kids.ts');
dit('la categorie Kids est celle du catalogue (CAT_KIDS, kids.ts)', /CAT_KIDS = '([^']+)'/.exec(kidsTs)?.[1], CATEGORIE_KIDS);
dit('la Premiere Couronne Kids : la pose et le pack de naissance, les deux au catalogue', [true, true],
  PREMIERE_COURONNE_KIDS.map((id) => kidsTs.includes(`'${id}'`)));

/* ── 1. Un cauris = une venue honoree ── */
{
  const a = [
    rdv('enf', '2026-09-01', ['sv-kids-sinsin', 'sv-kids-kloklo']),
    rdv('enf', '2026-09-20', ['sv-kids-sinsin'], 'annulé'),
    rdv('enf', '2026-10-25', ['sv-kids-sinsin'], 'confirmé'),
    rdv('enf', '2026-10-01', ['sv-kids-kloklo'], 'en attente'),
    rdv('autre', '2026-09-05', ['sv-kids-sinsin']),
  ];
  dit('une venue honoree a deux prestations Kids compte UN cauris ; annulee, confirmee, en attente : aucun ; celle d une autre fiche : aucun', 1, releve(ENFANT, a).cauris);
}
dit('l age : 15 ans ce jour-la compte, 16 non', [15, 16], [ageAuJour('2011-03-01', '2026-03-01'), ageAuJour('2010-03-01', '2026-03-01')]);
dit('l age se lit sans horloge : la veille de ses 8 ans, il en a 7 ; le jour meme, 8', [7, 8], [ageAuJour('2017-05-10', '2025-05-09'), ageAuJour('2017-05-10', '2025-05-10')]);
{
  const f15: FicheDuClub = { id: 'e15', birthday: '2011-03-01' };
  const f16: FicheDuClub = { id: 'e16', birthday: '2010-03-01' };
  const sans: FicheDuClub = { id: 'sans' };
  dit('une prestation de la Maison compte pour un enfant de 15 ans, pas de 16, pas sans date de naissance', [true, false, false], [
    estUneVenueDuClub(rdv('e15', '2026-03-01', ['sv-maison']), f15, SERVICES),
    estUneVenueDuClub(rdv('e16', '2026-03-01', ['sv-maison']), f16, SERVICES),
    estUneVenueDuClub(rdv('sans', '2026-03-01', ['sv-maison']), sans, SERVICES),
  ]);
  dit('une prestation Kids compte meme sans date de naissance', true, estUneVenueDuClub(rdv('sans', '2026-03-01', ['sv-kids-sinsin']), sans, SERVICES));
}

/* ── 2. Un adulte n'est jamais du Club ── */
{
  const r = releve(ADULTE, [rdv('adu', '2026-09-01', ['sv-maison']), rdv('adu', '2026-10-01', ['sv-maison'])]);
  dit('un adulte venu deux fois pour la Maison : pas membre, aucun cauris, aucun cadeau', [false, 0, 0], [r.membre, r.cauris, r.cadeaux.length]);
  const sansDate = releve({ id: 'x' }, [rdv('x', '2026-09-01', ['sv-maison'])]);
  dit('une fiche sans date de naissance, sans prestation Kids : pas membre', false, sansDate.membre);
}
{
  const r = releve(ENFANT, []);
  dit('un enfant de 9 ans pas encore venu : membre, 0 cauris, Bienvenue a 1 visite', [true, 0, 'Bienvenue', 1], [r.membre, r.cauris, r.prochain?.palier.nom, r.prochain?.manque]);
}

/* ── 3. Les paliers ── */
const venues = (nb: number, depuis = '2026-10-22'): RdvDuClub[] => Array.from({ length: nb }, (_, i) => {
  const d = new Date(`${depuis}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i * 7);
  return rdv('enf', d.toISOString().slice(0, 10), ['sv-kids-sinsin']);
});
{
  const r3 = releve(ENFANT, venues(3), '2027-06-01');
  dit('3 cauris : palier « Le premier rang », encore 3 pour « La moitie du collier »', ['Le premier rang', 'La moitié du collier', 3], [r3.palier?.nom, r3.prochain?.palier.nom, r3.prochain?.manque]);
  const r10 = releve(ENFANT, venues(10), '2027-06-01');
  dit('10 cauris : Petite Couronne, collier plein, plus de palier a venir', ['Petite Couronne', true, undefined], [r10.palier?.nom, r10.plein, r10.prochain]);
  const r12 = releve(ENFANT, venues(12), '2027-06-01');
  dit('12 venues : 12 cauris comptes, 10 sur le collier', [12, 10], [r12.cauris, r12.surLeCollier]);
}

/* ── 4. Les cadeaux : depuis le Club, chacun ; d'avant, le plus haut seul ── */
{
  const avant = Array.from({ length: 7 }, (_, i) => rdv('enf', `2026-0${3 + Math.floor(i / 2)}-${i % 2 ? '20' : '05'}`, ['sv-kids-sinsin']));
  const apres = venues(3, '2026-10-22');
  const r = releve(ENFANT, [...avant, ...apres], '2027-01-15');
  dit('7 venues avant le Club puis 3 apres : le kit de bienvenue (toujours), le 6 (le plus haut d avant) et le 10', [1, 6, 10], r.cadeaux.map((c) => c.palier.cauris));
  dit('... la bienvenue et le 6 disent qu ils ont ete atteints avant le Club, le 10 non', [true, true, false], r.cadeaux.map((c) => c.avantLeClub));
  const seulement = releve(ENFANT, avant, '2026-10-21');
  dit('7 venues avant le Club, aucune apres : le kit de bienvenue et le 6, jamais le 3', [1, 6], seulement.cadeaux.map((c) => c.palier.cauris));
}
{
  const r = releve(ENFANT, [rdv('enf', '2026-06-01', ['sv-kids-sinsin']), rdv('enf', '2026-07-01', ['sv-kids-sinsin']),
    rdv('enf', '2026-10-30', ['sv-kids-sinsin']), rdv('enf', '2026-11-15', ['sv-kids-sinsin'])], '2026-12-01');
  dit('2 venues avant, 2 apres : Bienvenue (le plus haut d avant) et Le premier rang (atteint apres)', [1, 3], r.cadeaux.map((c) => c.palier.cauris));
}
{
  const r = releve(ENFANT, [rdv('enf', '2026-09-01', ['sv-kids-sinsin']), rdv('enf', '2026-10-01', ['sv-kids-sinsin']),
    rdv('enf', CLUB_DEPUIS, ['sv-kids-sinsin'])], '2026-10-21');
  dit('un palier atteint le jour meme du Club compte comme depuis le Club', [1, 3], r.cadeaux.map((c) => c.palier.cauris));
}

/* ── 5. Le cadeau remis ── */
{
  const avecRemise: FicheDuClub = { ...ENFANT, clubCadeaux: { '1': { le: '2026-10-22', par: 'Gerard' } } };
  const r = releve(avecRemise, venues(3), '2026-12-01');
  dit('le cadeau 1 remis ne reste plus a remettre ; le 3 si', [[1, 3], [3]], [r.cadeaux.map((c) => c.palier.cauris), r.cadeauxARemettre.map((c) => c.palier.cauris)]);
  dit('remis deux fois, le premier jour reste', { le: '2026-10-22', par: 'Gerard' }, cadeauxApresRemise(avecRemise, 1, '2026-12-01', 'Brice')['1']);
  dit('remis une premiere fois : le jour et la main', { le: '2026-12-01', par: 'Brice' }, cadeauxApresRemise(ENFANT, 3, '2026-12-01', 'Brice')['3']);
}

/* ── 6. L'anniversaire de couronne ── */
{
  const a = [rdv('enf', '2025-11-05', ['sv-kids-vekpe']), rdv('enf', '2026-01-10', ['sv-kids-sinsin'])];
  const r = releve(ENFANT, a, '2026-10-21');
  dit('Premiere Couronne le 5 novembre 2025 : le 21 octobre 2026, prochain anniversaire le 5 novembre 2026, 1 an', ['2026-11-05', 1, false],
    [r.anniversaire?.prochain, r.anniversaire?.ans, r.anniversaire?.aujourdhui]);
  const ce = releve(ENFANT, a, '2026-11-05');
  dit('... le jour meme : c est aujourd hui', [true, 1], [ce.anniversaire?.aujourdhui, ce.anniversaire?.ans]);
  const lendemain = releve(ENFANT, a, '2026-11-06');
  dit('... le lendemain : le suivant, 2 ans', ['2027-11-05', 2], [lendemain.anniversaire?.prochain, lendemain.anniversaire?.ans]);
  const recente = releve(ENFANT, [rdv('enf', '2026-10-01', ['sv-kids-vekpe'])], '2026-10-21');
  dit('une Premiere Couronne d il y a trois semaines : un an au moins, le 1er octobre 2027', ['2027-10-01', 1], [recente.anniversaire?.prochain, recente.anniversaire?.ans]);
  const ceJour = releve(ENFANT, [rdv('enf', '2026-10-21', ['sv-kids-vekpe'])], '2026-10-21');
  dit('une Premiere Couronne posee aujourd hui : pas de fete a zero an, la premiere dans un an', ['2027-10-21', 1, false],
    [ceJour.anniversaire?.prochain, ceJour.anniversaire?.ans, ceJour.anniversaire?.aujourdhui]);
  dit('sans Premiere Couronne Kids a la Maison : pas d anniversaire', undefined, releve(ENFANT, [rdv('enf', '2026-01-10', ['sv-kids-sinsin'])]).anniversaire);
  dit('une Premiere Couronne annulee ne date rien', undefined, releve(ENFANT, [rdv('enf', '2026-01-10', ['sv-kids-vekpe'], 'annulé')]).anniversaire);
  dit('un 29 fevrier se fete le 28 les annees communes', '2025-02-28', releve(ENFANT, [rdv('enf', '2024-02-29', ['sv-kids-vekpe'])], '2025-01-10').anniversaire?.prochain);
}

/* ── 7. La fiche du rendez-vous ── */
{
  const deux = [rdv('enf', '2026-09-01', ['sv-kids-sinsin']), rdv('enf', '2026-10-01', ['sv-kids-sinsin'])];
  const futur = rdv('enf', '2026-10-30', ['sv-kids-sinsin'], 'confirmé');
  const e = caurisDuRdv(futur, ENFANT, [...deux, futur], SERVICES);
  dit('un rendez-vous a venir apres deux venues : il donnera le 3e cauris, palier « Le premier rang »', [3, 'Le premier rang', false], [e?.rang, e?.palier?.nom, e?.dejaCompte]);
  const honore = caurisDuRdv(deux[1], ENFANT, deux, SERVICES);
  dit('une venue deja honoree : son rang, deja compte', [2, true], [honore?.rang, honore?.dejaCompte]);
  dit('un rendez-vous annule : rien', undefined, caurisDuRdv(rdv('enf', '2026-10-30', ['sv-kids-sinsin'], 'annulé'), ENFANT, deux, SERVICES));
  dit('le rendez-vous d un adulte pour la Maison : rien', undefined, caurisDuRdv(rdv('adu', '2026-10-30', ['sv-maison'], 'confirmé'), ADULTE, [], SERVICES));
  dit('la phrase du comptoir au 3e cauris', '3e cauris : le bonnet de nuit est à remettre.', phraseDuPalier(3, PALIERS_DU_CLUB[1]));
  dit('la phrase du comptoir au 1er cauris (au pluriel)', '1er cauris : le cordon, le carnet et l’écusson du Club sont à remettre.', phraseDuPalier(1, PALIERS_DU_CLUB[0]));
  dit('la phrase du comptoir au 6e cauris', '6e cauris : la trousse « Mon kit de couronne » est à remettre.', phraseDuPalier(6, PALIERS_DU_CLUB[2]));
  dit('la phrase du comptoir au 10e cauris (au pluriel)', '10e cauris : le cauris d’or, le diplôme et la photo sont à remettre.', phraseDuPalier(10, PALIERS_DU_CLUB[3]));
  dit('les cauris viennent dans l ordre des venues', ['2026-09-01', '2026-10-01'], caurisDe(ENFANT, [deux[1], deux[0]], SERVICES).map((c) => c.date));
}

/* ── 8. La regle est pure, et les ecrans la lisent ── */
const club = sansCommentaires(lis('src/shared/club-pur.ts'));
dit('club-pur : aucun import, aucune horloge', [false, false, false], [/^import /m.test(club), /Date\.now\(/.test(club), /new Date\(/.test(club)]);
const carte = sansCommentaires(lis('src/apps/trone/routes/clients/CarteDuClub.tsx'));
const collier = sansCommentaires(lis('src/apps/couronne/SonCollier.tsx'));
dit('la carte du Trone lit releveDuClub et caurisDuRdv, sans recompter', [true, true, false],
  [/releveDuClub\(/.test(carte), /caurisDuRdv\(/.test(carte), /status === 'honor/.test(carte)]);
dit('le collier de Ma Couronne lit releveDuClub, sans recompter', [true, false], [/releveDuClub\(/.test(collier), /status === 'honor/.test(collier)]);
dit('la fiche 360 monte la carte du Club', true, /<CarteDuClub client=\{client\} appts=\{appts\} \/>/.test(lis('src/apps/trone/routes/clients/Customers.tsx')));
dit('la fiche du rendez-vous monte le signal du Club', true, /\{appt && <SignalDuClub appt=\{appt\} \/>\}/.test(lis('src/apps/trone/routes/clients/_shared.tsx')));
dit('l accueil de l enfant (Ma Couronne) monte son collier', true, /<SonCollier enfant=\{enfant\} appts=\{appts\} services=\{services\} \/>/.test(lis('src/apps/couronne/Tabs.tsx')));
dit('les dates du Trone portent leur annee (jourDitAvecLAnnee), aucune date coupee', [true, false], [/jourDitAvecLAnnee\(/.test(carte), /\.slice\(5/.test(carte)]);
dit('les dates de Ma Couronne portent leur annee (dateDansLaPhrase)', true, /dateDansLaPhrase\(/.test(collier));
dit('aucun tiret cadratin dans le texte des deux ecrans', [false, false], [carte.includes('—'), collier.includes('—')]);
dit('jamais « salon »', [false, false], [/\bsalon\b/i.test(carte), /\bsalon\b/i.test(collier)]);
dit('le Trone dit « Remis » et pose le cadeau par le magasin', [true, true], [/>Remis</.test(carte), /poseLeCadeauDuClub\(/.test(carte)]);
dit('Ma Couronne tutoie l enfant dans ses deux lignes « Encore » (cadeauPourToi), vouvoie le parent pour le cadeau qui attend (cadeau)', [2, 0, true],
  [(collier.match(/cadeau: prochain\.palier\.cadeauPourToi \}/g) ?? []).length,
    (collier.match(/cadeau: prochain\.palier\.cadeau \}/g) ?? []).length,
    /cadeau: c\.palier\.cadeau \}/.test(collier)]);

console.log(ko === 0 ? `\nLe Club des Petites Couronnes tient sa regle (${n} epreuves).` : `\n${ko} echec(s) sur ${n}.`);
