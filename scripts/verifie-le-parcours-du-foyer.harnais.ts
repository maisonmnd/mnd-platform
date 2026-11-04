/* LE PARCOURS DU FOYER, ÉPROUVÉ — `node scripts/verifie-le-parcours-du-foyer.mjs` (et `--prouve`).

   4 novembre 2026, J. K. et F. K. : deux sœurs qui viennent toujours
   ensemble, posées à part pour le mardi 22 décembre 2026 à 10 h, chez Team.
   Le cas est rejoué ici avec ses identifiants, ses gestes, son heure et son
   maître ; les noms sont inventés (Joy Akpo, Fifi Akpo), le numéro aussi.
   Puis chaque règle de shared/foyer-pur.ts une à une, la facture du foyer
   qui doit toujours réunir le foyer, le réglage SQL du jour, et les écrans
   qui doivent passer par ces règles (lus, pas importés). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  aLierAvec, appliqueLeDeplacement, compagnesAPoser, deplacementDuFoyer, EQUIVALENCES_KIDS, foyerDuRdv,
  gestesDeSonAge, lienDesRdvs, maitresDesCompagnes, memeFoyerQue, prenomDe, prenomsDits, questionDAnnulation, rdvsDuFoyer,
  tetesDuFoyer, versionDeSonAge, type CompteDuFoyer, type RdvDuFoyer, type TeteDuCompte, type VerdictDeLAge,
} from '../src/shared/foyer-pur';
import { rdvsDuFoyerLeJour } from '../src/shared/facture-du-foyer-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const lis = (env: string, rel: string) => readFileSync(process.env[env] ?? path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── LE CAS DU 4 NOVEMBRE 2026 ─────────────────────────────────────────── */
const BR = 'br-40r6u6frno';
const FAM = 'fam-3hh0id5nbu';
const J = 'lvkoa7dity';
const F = 'yqam9wgctj';
const RDV_J = 'i4gg2fee0t';
const RDV_F = 'ni8vhz0g87';
const KLOKLO = 'sv-plt-05-ess-c';
const SINSIN = 'sv-atl-ii-e';
const KLOKLO_KIDS = 'sv-kids-kloklo';
const SINSIN_KIDS = 'sv-kids-sinsin';
const TEL = '+229 01 00 00 00 42';
const fiche = (id: string, name: string, o: Partial<TeteDuCompte> = {}): TeteDuCompte => ({ id, name, familyId: FAM, phone: TEL, ...o });
const FICHES: TeteDuCompte[] = [
  fiche(J, 'Joy Akpo'),
  fiche(F, 'Fifi Akpo'),
  fiche('autre', 'Une Autre', { familyId: 'fam-autre', phone: '+229 01 11 11 11 11' }),
];
/* L'âge, lu comme le Trône (estKids) : J. K. paie la carte des grandes, F. K. (9 ans) la carte MND Kids. */
const AGE: Record<string, VerdictDeLAge> = { [J]: 'non', [F]: 'oui', autre: 'non' };
type Rdv = RdvDuFoyer & { serviceIds: string[] };
const rdv = (id: string, clientId: string, serviceIds: string[], o: Partial<Rdv> = {}): Rdv => ({
  id, clientId, serviceIds, date: '2026-12-22', time: '10:00', master: 'Team', status: 'confirmé', branchId: BR, ...o,
});
const POSES: Rdv[] = [
  rdv(RDV_J, J, [KLOKLO, SINSIN]),
  rdv(RDV_F, F, [KLOKLO_KIDS, SINSIN_KIDS]),
  rdv('ap-autre', 'autre', [KLOKLO], { master: 'Expert' }),
];
const de = (l: readonly Rdv[], id: string) => l.find((a) => a.id === id)!;
const SANS_CASE: CompteDuFoyer = { id: FAM };
const AVEC_CASE: CompteDuFoyer = { id: FAM, toujoursEnsemble: true };

/* 1. Posées à part ce matin : le Trône les reconnaît. */
dit('posées à part, J. K. voit F. K. à lier (même compte, même jour, même heure)', [RDV_F], aLierAvec(de(POSES, RDV_J), POSES, FICHES).map((a) => a.id));
dit('... et F. K. voit J. K.', [RDV_J], aLierAvec(de(POSES, RDV_F), POSES, FICHES).map((a) => a.id));
dit('une tête d un autre compte, à la même heure, ne se lie pas', [], aLierAvec(de(POSES, 'ap-autre'), POSES, FICHES).map((a) => a.id));
const AILLEURS = POSES.map((a) => (a.id === RDV_F ? { ...a, time: '14:00' } : a));
dit('à 10 h et 14 h le même jour, elles viennent deux fois : rien à lier', [], aLierAvec(de(AILLEURS, RDV_J), AILLEURS, FICHES).map((a) => a.id));
const SANS_COMPTE = FICHES.map((f) => (f.id === F ? { ...f, familyId: undefined } : f));
dit('sans compte famille commun, même au même numéro : rien à lier', [], aLierAvec(de(POSES, RDV_J), POSES, SANS_COMPTE).map((a) => a.id));
const UNE_ANNULEE = POSES.map((a) => (a.id === RDV_F ? { ...a, status: 'annulé' } : a));
dit('une sœur annulée ne se lie pas', [], aLierAvec(de(UNE_ANNULEE, RDV_J), UNE_ANNULEE, FICHES).map((a) => a.id));

/* 2. Un toucher, et le foyer se forme. */
const lien = lienDesRdvs([de(POSES, RDV_J), ...aLierAvec(de(POSES, RDV_J), POSES, FICHES)], 'fo-neuf');
dit('« Les lier » pose un foyerId neuf sur les deux', { foyerId: 'fo-neuf', ids: [RDV_J, RDV_F] }, lien);
dit('... ou celui que l une porte déjà (on rejoint un foyer)', 'fo-deja',
  lienDesRdvs([de(POSES, RDV_J), { ...de(POSES, RDV_F), foyerId: 'fo-deja' }], 'fo-neuf').foyerId);
const LIEES = POSES.map((a) => (lien.ids.includes(a.id) ? { ...a, foyerId: lien.foyerId } : a));
dit('liées, plus rien à lier', [], aLierAvec(de(LIEES, RDV_J), LIEES, FICHES).map((a) => a.id));
dit('le foyer de J. K. : J. K. et F. K., dans l ordre de l heure', [RDV_J, RDV_F], rdvsDuFoyer(de(LIEES, RDV_J), LIEES).map((a) => a.id));
dit('les deux sont du même foyer', true, memeFoyerQue(de(LIEES, RDV_J), de(LIEES, RDV_F), LIEES));

/* 3. Pour le chantier des messages : qui vient, à quel numéro. */
const foyer = foyerDuRdv(de(LIEES, RDV_F), LIEES, FICHES);
dit('le foyer dit ses têtes par leur prénom seul', ['Joy', 'Fifi'], foyer.tetes.map((t) => t.prenom));
dit('... ensemble : « Joy et Fifi »', 'Joy et Fifi', foyer.prenoms);
dit('... au numéro du foyer, un seul', { numero: TEL, memeNumero: true, estUnFoyer: true }, { numero: foyer.numero, memeNumero: foyer.memeNumero, estUnFoyer: foyer.estUnFoyer });
const DEUX_NUMEROS = FICHES.map((f) => (f.id === F ? { ...f, phone: '+229 01 22 22 22 22' } : f));
const f2 = foyerDuRdv(de(LIEES, RDV_J), LIEES, DEUX_NUMEROS);
dit('deux numéros : celui de la première tête de l heure, et les deux dits', { numero: TEL, n: 2, memeNumero: false }, { numero: f2.numero, n: f2.numeros.length, memeNumero: f2.memeNumero });
const PREVENIR = LIEES.map((a) => ({ ...a, numeroAPrevenir: '+229 01 33 33 33 33' }));
dit('le numéro à prévenir du rendez-vous passe devant la fiche (telDuRdv)', '+229 01 33 33 33 33',
  foyerDuRdv(de(PREVENIR, RDV_J), PREVENIR, FICHES).numero);
dit('hors foyer, une seule tête, pas de foyer', { estUnFoyer: false, n: 1 },
  (() => { const x = foyerDuRdv(de(POSES, RDV_J), POSES, FICHES); return { estUnFoyer: x.estUnFoyer, n: x.rdvs.length }; })());

/* 4. Déplacer le foyer (pour le Trône, le calendrier et Opale). */
const vers29 = deplacementDuFoyer({ rdv: de(LIEES, RDV_J), rdvs: LIEES, date: '2026-12-29', time: '10:00' });
dit('« déplace J. K. au 29 décembre 2026 » déplace les deux, à la même heure',
  [{ id: RDV_J, date: '2026-12-29', time: '10:00' }, { id: RDV_F, date: '2026-12-29', time: '10:00' }], vers29);
const APRES29 = appliqueLeDeplacement(LIEES, vers29);
dit('... chacune garde son maître, ses gestes et son foyer',
  [['Team', [KLOKLO, SINSIN], lien.foyerId], ['Team', [KLOKLO_KIDS, SINSIN_KIDS], lien.foyerId]],
  [RDV_J, RDV_F].map((id) => [de(APRES29, id).master, de(APRES29, id).serviceIds, de(APRES29, id).foyerId]));
dit('... et le rendez-vous d une autre famille ne bouge pas', '2026-12-22', de(APRES29, 'ap-autre').date);
dit('rien ne change : aucune écriture', [], deplacementDuFoyer({ rdv: de(LIEES, RDV_J), rdvs: LIEES, date: '2026-12-22', time: '10:00' }));
const seule = deplacementDuFoyer({ rdv: de(LIEES, RDV_F), rdvs: LIEES, date: '2026-12-29', time: '10:00', seulementElle: true });
dit('« seulement elle » : F. K. seule bouge, et quitte le foyer', [{ id: RDV_F, date: '2026-12-29', time: '10:00', detache: true }], seule);
const APRES_SEULE = appliqueLeDeplacement(LIEES, seule);
dit('... J. K. reste le 22 décembre 2026 à 10 h', ['2026-12-22', '10:00', lien.foyerId], [de(APRES_SEULE, RDV_J).date, de(APRES_SEULE, RDV_J).time, de(APRES_SEULE, RDV_J).foyerId]);
dit('... F. K. n a plus de foyer', undefined, de(APRES_SEULE, RDV_F).foyerId);
dit('... et le déplacement suivant de J. K. ne l emporte plus', [RDV_J],
  deplacementDuFoyer({ rdv: de(APRES_SEULE, RDV_J), rdvs: APRES_SEULE, date: '2027-01-05', time: '11:00' }).map((d) => d.id));
const A_LA_SUITE = LIEES.map((a) => (a.id === RDV_F ? { ...a, time: '12:30' } : a));
dit('posées à la suite (RdvFoyer), la seconde garde son écart : 11:00 et 13:30',
  ['11:00', '13:30'], deplacementDuFoyer({ rdv: de(A_LA_SUITE, RDV_J), rdvs: A_LA_SUITE, date: '2026-12-22', time: '11:00' }).map((d) => d.time));
const UNE_HONOREE = LIEES.map((a) => (a.id === RDV_F ? { ...a, status: 'honoré' } : a));
dit('une sœur honorée a eu lieu : elle ne bouge pas', [RDV_J],
  deplacementDuFoyer({ rdv: de(UNE_HONOREE, RDV_J), rdvs: UNE_HONOREE, date: '2026-12-29', time: '10:00' }).map((d) => d.id));
const AUTRE_JOUR = LIEES.map((a) => (a.id === RDV_F ? { ...a, date: '2026-12-23' } : a));
dit('un foyer est une venue : une sœur à un autre jour ne suit pas', [RDV_J],
  deplacementDuFoyer({ rdv: de(AUTRE_JOUR, RDV_J), rdvs: AUTRE_JOUR, date: '2026-12-29', time: '10:00' }).map((d) => d.id));

/* 5. Annuler : « les deux, ou seulement Fifi ? ». */
const q = questionDAnnulation(de(LIEES, RDV_F), LIEES, FICHES);
dit('la question nomme le prénom de celle qu on annule', 'Annuler les deux, ou seulement Fifi ?', q?.titre);
dit('... ses deux réponses', { tous: 'Les deux', elle: 'Seulement Fifi', idsTous: [RDV_F, RDV_J], idsElle: [RDV_F] },
  q && { tous: q.tous, elle: q.elle, idsTous: q.idsTous, idsElle: q.idsElle });
dit('... jamais le nom de famille, jamais de civilité supposée', false, /Akpo|Mme|Madame|Mlle|M\. /.test(JSON.stringify(q)));
dit('hors foyer, rien à demander', null, questionDAnnulation(de(POSES, RDV_J), POSES, FICHES));
dit('la sœur déjà honorée : rien à demander', null, questionDAnnulation(de(UNE_HONOREE, RDV_J), UNE_HONOREE, FICHES));
const TROIS = [...LIEES, rdv('ap-3', 'c3', [KLOKLO], { foyerId: lien.foyerId, master: 'Expert' })];
dit('trois têtes : « les trois »', 'Annuler les trois, ou seulement Joy ?', questionDAnnulation(de(TROIS, RDV_J), TROIS, FICHES)?.titre);
dit('le prénom seul, une civilité écrite au nom se saute', ['Joy', 'Shadé', 'Ola', ''],
  [prenomDe('Joy Akpo'), prenomDe('Mme Shadé Akpo'), prenomDe('  Ola  '), prenomDe(undefined)]);
dit('les prénoms dits ensemble', ['Joy', 'Joy et Fifi', 'Joy, Fifi et Ola'], [prenomsDits(['Joy']), prenomsDits(['Joy', 'Fifi']), prenomsDits(['Joy', 'Fifi', 'Ola'])]);

/* 6. La version de son âge (KLƆKLƆ™ / SÍNSIN™ / soins). */
const pourF = gestesDeSonAge([KLOKLO, SINSIN], AGE[F]);
dit('les gestes de J. K. pour F. K., 9 ans : la carte MND Kids', [KLOKLO_KIDS, SINSIN_KIDS], pourF.serviceIds);
dit('... exactement ceux posés ce matin pour elle', de(POSES, RDV_F).serviceIds, pourF.serviceIds);
dit('les gestes de F. K. pour J. K. : la carte des grandes, l Essentiel', [KLOKLO, SINSIN], gestesDeSonAge([KLOKLO_KIDS, SINSIN_KIDS], AGE[J]).serviceIds);
dit('à âge égal, les mêmes gestes', [KLOKLO, SINSIN], gestesDeSonAge([KLOKLO, SINSIN], 'non').serviceIds);
dit('un âge inconnu ne change rien', [KLOKLO, SINSIN], gestesDeSonAge([KLOKLO, SINSIN], 'inconnu').serviceIds);
dit('les trois lavages et la Signature des grandes ont leur version Kids', [KLOKLO_KIDS, KLOKLO_KIDS, KLOKLO_KIDS, SINSIN_KIDS],
  ['sv-plt-05-sig-c', 'sv-plt-05-pre-c', 'sv-dds-shp-e', 'sv-atl-ii-l'].map((id) => versionDeSonAge(id, 'oui').id));
dit('les soins : le renfort et la sublimation', ['sv-kids-gbigbi', 'sv-kids-yekpe'], ['sv-plt-40-m', 'sv-gbeji-sublimation'].map((id) => versionDeSonAge(id, 'oui').id));
dit('deux lavages des grandes font un seul KLƆKLƆ™ Kids', [KLOKLO_KIDS], gestesDeSonAge([KLOKLO, 'sv-plt-05-sig-c'], 'oui').serviceIds);
dit('un soin sans version Kids reste, signalé à revoir', { ids: [KLOKLO_KIDS, 'sv-plt-10-m'], aRevoir: ['sv-plt-10-m'] },
  (() => { const g = gestesDeSonAge([KLOKLO, 'sv-plt-10-m'], 'oui'); return { ids: g.serviceIds, aRevoir: g.aRevoir }; })());
dit('un geste Kids que la table ne nomme pas, lu au catalogue (reserveEnfants), reste à l enfant', 'sv-kids-vekpe',
  versionDeSonAge('sv-kids-vekpe', 'oui', (id) => id.startsWith('sv-kids-')).id);
dit('chaque version Kids de la table est une prestation de la section', true, EQUIVALENCES_KIDS.every((e) => e.kids.startsWith('sv-kids-')));

/* 7. La case « Elles viennent toujours ensemble ». */
const VIDE: Rdv[] = [];
const pose = (famille: CompteDuFoyer, rdvs: Rdv[] = VIDE, exclues?: ReadonlySet<string>) => compagnesAPoser({
  clientId: J, fiches: FICHES, famille, rdvs, branchId: BR, date: '2026-12-22', time: '10:00',
  serviceIds: [KLOKLO, SINSIN], verdictDe: (c) => AGE[c.id] ?? 'inconnu', exclues,
});
dit('sans la case, poser J. K. ne pose qu elle', { ensemble: false, aPoser: [] }, (() => { const r = pose(SANS_CASE); return { ensemble: r.ensemble, aPoser: r.aPoser }; })());
const avec = pose(AVEC_CASE);
dit('avec la case, F. K. vient aussi, aux gestes de son âge', [{ clientId: F, prenom: 'Fifi', serviceIds: [KLOKLO_KIDS, SINSIN_KIDS] }],
  avec.aPoser.map((c) => ({ clientId: c.clientId, prenom: c.prenom, serviceIds: c.serviceIds })));
dit('la case d un autre compte ne pose personne', [], pose({ id: 'fam-autre', toujoursEnsemble: true }).aPoser);
dit('« pas cette fois » : F. K. retirée, J. K. seule', [], pose(AVEC_CASE, VIDE, new Set([F])).aPoser);
const DEJA = [rdv(RDV_F, F, [KLOKLO_KIDS, SINSIN_KIDS])];
const deja = pose(AVEC_CASE, DEJA);
dit('F. K. déjà posée à 10 h : pas de second rendez-vous, il rejoint le foyer', { aPoser: [], dejaLa: [{ apptId: RDV_F, memeHeure: true }] },
  { aPoser: deja.aPoser, dejaLa: deja.dejaLa.map((d) => ({ apptId: d.apptId, memeHeure: d.memeHeure })) });
dit('... à 14 h ce jour-là : pas de second rendez-vous non plus, il reste à part', [{ apptId: RDV_F, memeHeure: false }],
  pose(AVEC_CASE, [{ ...DEJA[0], time: '14:00' }]).dejaLa.map((d) => ({ apptId: d.apptId, memeHeure: d.memeHeure })));
dit('les têtes d un compte, celle par qui l on arrive en tête', [F, J], tetesDuFoyer(FICHES[1], FICHES).map((c) => c.id));

/* 8. À la même heure, sur l'autre fauteuil. */
dit('un SÍNSIN va chez Team : les deux sœurs chez Team, comme le 22 décembre 2026', { [F]: 'Team' },
  maitresDesCompagnes({ maitreDeLaTete: 'Team', compagnes: [{ clientId: F, permis: ['Team'] }], libres: ['Expert'] }));
dit('sans SÍNSIN, l autre maître libre', { [F]: 'Expert' },
  maitresDesCompagnes({ maitreDeLaTete: 'Team', compagnes: [{ clientId: F, permis: ['Team', 'Expert'] }], libres: ['Team', 'Expert'] }));
dit('aucun autre maître libre : celui de la tête, les fauteuils se comptent à la pose', { [F]: 'Team' },
  maitresDesCompagnes({ maitreDeLaTete: 'Team', compagnes: [{ clientId: F, permis: ['Team', 'Expert'] }], libres: [] }));
dit('deux sœurs avec elle : chacune son maître libre', { a: 'Expert', b: 'Trois' },
  maitresDesCompagnes({ maitreDeLaTete: 'Team', compagnes: [{ clientId: 'a', permis: ['Team', 'Expert', 'Trois'] }, { clientId: 'b', permis: ['Team', 'Expert', 'Trois'] }], libres: ['Expert', 'Trois'] }));

/* 9. La facture du foyer réunit toujours le foyer. Elle ne lit pas
   `foyerId` (elle ne l'a jamais lu : même compte famille, ou même numéro, le
   même jour) ; un foyer ne se forme que dans un même compte, elle le couvre
   donc. Le cas à deux numéros prouve qu'elle lit le compte. */
const TETES_FACTURE = DEUX_NUMEROS.map((f) => ({ id: f.id, familyId: f.familyId, phone: f.phone }));
const facture = rdvsDuFoyerLeJour(de(LIEES, RDV_J), LIEES, TETES_FACTURE).map((a) => a.id).sort();
dit('la facture du foyer réunit J. K. et F. K., même à deux numéros', [RDV_J, RDV_F], facture);
dit('... et tout rendez-vous du foyer y entre', true, rdvsDuFoyer(de(LIEES, RDV_J), LIEES).every((a) => facture.includes(a.id)));
dit('... jamais une autre famille du même jour', false, facture.includes('ap-autre'));

/* 10. Le réglage SQL du jour : la copie de repli d'abord, RLS aussitôt. */
const sql = lis('FOYER_SQL', 'supabase/reglage_foyer_jk_fk_20261104.sql');
const net = sql.replace(/--[^\n]*/g, '');
const premiereEcriture = net.search(/\bupdate\s+public\./i);
const replis = [...net.matchAll(/create table if not exists public\.(repli_[a-z0-9_]+)\s+as\s+select[^;]*from public\.(\w+)/gi)].map((m) => ({ table: m[1], de: m[2], ou: m.index ?? 0 }));
dit('une copie de repli des rendez-vous et une du compte famille', ['appointments', 'families'], replis.map((r) => r.de).sort());
dit('... toutes avant la première écriture', true, replis.length > 0 && premiereEcriture > 0 && replis.every((r) => r.ou < premiereEcriture));
dit('... chacune sous RLS aussitôt, avant la première écriture', true, replis.length > 0 && replis.every((r) => {
  const rls = net.search(new RegExp(`alter table public\\.${r.table} enable row level security`, 'i'));
  return rls > r.ou && rls < premiereEcriture;
}));
dit('le foyer se pose sur les deux rendez-vous du 22 décembre 2026 à 10 h, et seulement eux', true,
  net.includes(`'${RDV_J}', '${RDV_F}'`) && net.includes("data->>'date' = '2026-12-22'") && net.includes("data->>'time' = '10:00'") && net.includes('count(*) = 2'));
dit('... sur les deux à la fois ou sur aucune (l une déplacée ou annulée entre-temps : rien)', true,
  /with deux as \([\s\S]*count\(\*\) = 2 as vivantes[\s\S]*\)\s*update public\.appointments[\s\S]*and \(select vivantes from deux\)/.test(net));
dit('... et la case sur leur compte', true, /update public\.families[\s\S]*toujoursEnsemble[\s\S]*where id = 'fam-3hh0id5nbu'/.test(net));
dit('rejouable : rien ne se réécrit deux fois', true, net.includes("coalesce(data->>'foyerId', '') <> ") && net.includes("coalesce(data->>'toujoursEnsemble', 'false') <> 'true'"));
dit('rien qui détruise', false, /\b(drop\s+table|truncate|delete\s+from|drop\s+column)\b/i.test(net));
dit('aucun nom de cliente : les initiales seules', false, /Akpo|Kpogbozan/i.test(sql));

/* 11. Les écrans passent par ces règles (lus, pas importés). */
const shared = sansCommentaires(lis('FOYER_SHARED', 'src/apps/trone/routes/clients/_shared.tsx'));
const carnet = sansCommentaires(lis('FOYER_CARNET', 'src/apps/trone/routes/clients/Carnet.tsx'));
const calendrier = sansCommentaires(lis('FOYER_CALENDRIER', 'src/apps/trone/routes/clients/Calendrier.tsx'));
const comptes = sansCommentaires(lis('FOYER_COMPTES', 'src/apps/trone/routes/finances/Comptes.tsx'));
const gestes = sansCommentaires(lis('FOYER_GESTES', 'src/apps/trone/routes/clients/foyer-gestes.ts'));
dit('la fenêtre : changer le jour ou l heure déplace le foyer, sauf « seulement elle »', true,
  shared.includes('deplacementDuFoyer({ rdv: avantDeLEcriture, rdvs: appointmentsStore.get(), date, time, seulementElle })')
  && shared.includes('appliqueLeDeplacement(prev, d)'));
dit('la fenêtre : poser une tête « toujours ensemble » pose ses sœurs, au même foyer', true,
  shared.includes('suites: [...suites, ...desCompagnes]') && shared.includes('foyerId: lien.foyerId') && shared.includes('compagnesAPoser({'));
dit('la fenêtre : « Annuler le rendez-vous » demande les deux ou seulement elle', true, /const cancelRdv = async[\s\S]*?await quiAnnuler\(/.test(shared));
dit('la fenêtre : « annulé » au statut attend la réponse', true, shared.includes('if (annuleIci && !annuleLeFoyer)'));
dit('la fenêtre : « Les lier »', true, shared.includes('lieLeFoyer(rdvDuMagasin)') && shared.includes('aLierAvec(rdvDuMagasin, branchAppts, clients)'));
dit('le Carnet : l annulation d un toucher et du menu passe par la question', true,
  /const annuleDuDoigt = async[\s\S]*?await quiAnnuler\(a\)/.test(carnet) && !carnet.includes("setStatus(a.id, 'annulé')"));
dit('le calendrier : glisser un rendez-vous du foyer emmène le foyer', true,
  /const applyMove = [\s\S]*?deplaceAvecLeFoyer\(a, next\)/.test(calendrier) && !/applyMove[\s\S]{0,400}x\.id === a\.id \? \{ \.\.\.x, date: next\.date/.test(calendrier));
dit('les gestes du Trône lisent la règle pure', true,
  gestes.includes('questionDAnnulation(appt, appointmentsStore.get(), clientsStore.get())') && gestes.includes('deplacementDuFoyer({ rdv: appt'));
dit('le compte famille garde la case à l enregistrement', true,
  comptes.includes('...(family ?? {}),') && comptes.includes('toujoursEnsemble: toujoursEnsemble || undefined'));

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
