/* LE MERCREDI DE LA MAISON, EPROUVE — 2 novembre 2026.
   `node scripts/verifie-le-mercredi-de-la-maison.mjs` (et `--prouve`).

   La decision (maquette « Remplir les fauteuils », arbitrages 3 et 4) :
   −15 % sur le rituel pose un MERCREDI, code MERCREDI15, jusqu'au 31 decembre
   2026, hors formules et abonnements, ne s'ajoute a aucun autre code,
   partout (le site, Ma Couronne, le comptoir du Trone qui l'applique). Le net
   d'un code monte au 1 000 F superieur : un lavage a 10 000 F un mercredi
   coute 9 000 F.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases, jamais du code
   eprouve. La regle pure tourne pour de vrai (offres-pur, encaissement-pur,
   caisse-fluide-pur, la lecture du Carnet), la copie du serveur aussi
   (demande-submit, extraite entre ses reperes) ; les ecrans se lisent dans
   leur source, commentaires effaces, et le reglage SQL dans son texte. */
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  JOURS_DES_OFFRES, PALIER_DU_NET_XOF, arrondiDuNet, courtPourLaVenue, estUnCodeDuJour, jourDeLaSemaine,
  lignesDuCode, offreDuCode, offreDuCodePassee, offreDuJourDeLaVenue, poseLOffreDuJour, pourquoiLOffreNeCourtPas,
  remiseDeLOffreSurLeTicket, remisesDeLaMainSeules,
} from '../src/shared/offres-pur';
import { leTicket, libelleDuCode, PALIER_DU_CODE_XOF } from '../src/apps/trone/routes/vente/encaissement-pur';
import { offreAProposer } from '../src/apps/trone/routes/vente/caisse-fluide-pur';
import { apptNetXof, apptTotalXof } from '../src/apps/trone/routes/clients/_shared';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};

const racine = process.cwd();
const brut = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => sansCommentaires(brut(rel));

/* ── Les fixtures ─────────────────────────────────────────────────── */
const LA_MAISON = 'br-maison';
const MERCREDI = {
  id: 'of-mercredi15', branchId: LA_MAISON, title: 'Le mercredi de la Maison', active: true,
  code: 'MERCREDI15', discountPct: 15, du: '2026-11-04', au: '2026-12-31', joursDeLaVenue: ['Mer'],
  days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], serviceIds: ['lavage', 'reprise'],
};
const ROSE = { id: 'rose', branchId: LA_MAISON, title: 'Octobre Rose', active: true, code: 'ROSE15', discountPct: 15, du: '2026-10-01', au: '2026-10-31', serviceIds: ['soin'] };
const VIDE = { ...MERCREDI, id: 'vide', code: 'VIDE15', serviceIds: [] as string[] };
const MER_4 = '2026-11-04';
const MAR_3 = '2026-11-03';
const JEU_12 = '2026-11-12';
const venue = (dateIso: string | null, o: object = {}) => ({ branchId: LA_MAISON, dateIso, serviceIds: ['lavage'], ...o });
const ID = (x: { id?: string } | null | undefined) => x?.id ?? null;

/* ══ 1. Le jour de la semaine, sans fuseau ══ */
dit('le 4 novembre 2026 est un mercredi, le 3 un mardi, le 1er un dimanche, le 12 un jeudi ; une date illisible ne rend rien',
  ['Mer', 'Mar', 'Dim', 'Jeu', null], [jourDeLaSemaine(MER_4), jourDeLaSemaine(MAR_3), jourDeLaSemaine('2026-11-01'), jourDeLaSemaine(JEU_12), jourDeLaSemaine('demain')]);
{
  const m = /export const OFFER_DAYS = \[([^\]]+)\] as const;/.exec(source('src/shared/offers.ts'));
  const jours = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  dit('les jours des offres (offres-pur) sont ceux de OFFER_DAYS (offers.ts)', jours, [...JOURS_DES_OFFRES]);
}
dit('le palier du net (offres-pur) est celui de la Caisse : 1 000 F', [1000, 1000], [PALIER_DU_NET_XOF, PALIER_DU_CODE_XOF]);

/* ══ 2. Un mercredi, et lui seul, dans sa saison ══ */
dit('un lavage le mercredi 4 novembre 2026 recoit le mercredi de la Maison', 'of-mercredi15', ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4))));
dit('PANNE « un mardi remise » : le mardi 3 novembre, rien', null, ID(offreDuJourDeLaVenue([MERCREDI], venue(MAR_3))));
dit('... ni le jeudi, ni le samedi', [null, null], [ID(offreDuJourDeLaVenue([MERCREDI], venue(JEU_12))), ID(offreDuJourDeLaVenue([MERCREDI], venue('2026-11-07')))]);
dit('la saison se lit sur la date de la venue : le 28 octobre et le 6 janvier 2027, mercredis, rien ; le 30 decembre, oui',
  [null, null, 'of-mercredi15'],
  [ID(offreDuJourDeLaVenue([MERCREDI], venue('2026-10-28'))), ID(offreDuJourDeLaVenue([MERCREDI], venue('2027-01-06'))), ID(offreDuJourDeLaVenue([MERCREDI], venue('2026-12-30')))]);
dit('sans jour choisi, rien ; d une autre maison, rien', [null, null],
  [ID(offreDuJourDeLaVenue([MERCREDI], venue(null))), ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { branchId: 'br-autre' })))]);

/* ══ 3. Le jour ou l'on regarde ne compte pas ══ */
const MARDI_10 = new Date('2026-11-10T10:00:00');
const MERCREDI_11 = new Date('2026-11-11T10:00:00');
dit('PANNE « le jour regarde » : regarde un mercredi pour un jeudi, MERCREDI15 ne court pas', null, ID(offreDuCode([MERCREDI], 'MERCREDI15', MERCREDI_11, JEU_12)));
dit('... regarde un mardi pour le mercredi, il court', 'of-mercredi15', ID(offreDuCode([MERCREDI], 'mercredi 15', MARDI_10, '2026-11-11')));
dit('sans jour choisi (null), il ne court pas meme un mercredi ; sans venue dite, le ticket du jour (cliente de passage) le juge',
  [false, true, false],
  [courtPourLaVenue(MERCREDI, MERCREDI_11, null), courtPourLaVenue(MERCREDI, MERCREDI_11), courtPourLaVenue(MERCREDI, MARDI_10)]);
dit('les offres sans jours de la venue ne changent pas : ROSE15 en octobre, quelle que soit la venue, et plus en novembre',
  ['rose', 'rose', null, null],
  [ID(offreDuCode([ROSE], 'ROSE15', new Date('2026-10-15T10:00:00'), MER_4)), ID(offreDuCode([ROSE], 'ROSE15', new Date('2026-10-15T10:00:00'))),
    ID(offreDuCode([ROSE], 'ROSE15', new Date('2026-11-05T10:00:00'), '2026-10-15')), ID(offreDuJourDeLaVenue([ROSE], venue('2026-10-14', { serviceIds: ['soin'] })))]);
dit('le code d un autre jour se dit avec ses jours et son annee',
  ['of-mercredi15', 'Ce code vaut pour un rendez-vous le mercredi, jusqu’au 31 décembre 2026.',
    'Ce code valait pour un rendez-vous le mercredi, jusqu’au 31 décembre 2026.',
    'Ce code vaut pour un rendez-vous le mercredi à partir du 4 novembre 2026, jusqu’au 31 décembre 2026.',
    'Ce code vaut pour un rendez-vous le mercredi à partir du 4 novembre 2026, jusqu’au 31 décembre 2026.'],
  [ID(offreDuCodePassee([MERCREDI], 'MERCREDI15', MARDI_10, MAR_3)), pourquoiLOffreNeCourtPas(MERCREDI, MARDI_10, JEU_12),
    pourquoiLOffreNeCourtPas(MERCREDI, MARDI_10, '2027-01-06'), pourquoiLOffreNeCourtPas(MERCREDI, MARDI_10, '2026-10-28'),
    pourquoiLOffreNeCourtPas(MERCREDI, MARDI_10, MAR_3)]);

/* ══ 4. Hors formules et abonnements, et jamais deux codes ══ */
dit('PANNE « un abonnement remise » : couvert par l abonnement, ou au forfait, rien', [null, null],
  [ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { couvertParAbonnement: true }))), ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { forfait: true })))]);
dit('PANNE « deux codes cumules » : un rendez-vous qui porte deja un code ne recoit rien', null, ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { dejaUnCode: true }))));
dit('ecartee par la Maison, rien', null, ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { ecartee: true }))));

/* ══ 5. Vide ne veut pas dire toutes ══ */
dit('PANNE « serviceIds vide » : une offre qui ne couvre rien ne se pose sur rien', null, ID(offreDuJourDeLaVenue([VIDE], venue(MER_4))));
dit('... et ne retire rien de ses lignes', [false], lignesDuCode([{ id: 'lavage', prixXof: 10_000, ferme: true }], VIDE).map((l) => l.remisee));
dit('un geste que l offre ne couvre pas (styling) ne la fait pas poser', null, ID(offreDuJourDeLaVenue([MERCREDI], venue(MER_4, { serviceIds: ['styling'] }))));

/* ══ 6. Ce qui s'ecrit sur le rendez-vous, comme le site ══ */
{
  const pose = poseLOffreDuJour(MERCREDI, [{ id: 'lavage', prixXof: 10_000, ferme: true }, { id: 'styling', prixXof: 2_000, ferme: true }]);
  dit('le code, l offre, et la remise sur la seule ligne couverte', { codeOffre: 'MERCREDI15', offreId: 'of-mercredi15', remisesLignes: [{ pct: 15 }, null] }, pose);
  dit('une ligne remisee a la main garde sa remise : le code ne s y ajoute pas',
    [{ xof: 1000 }, { pct: 15 }],
    poseLOffreDuJour(MERCREDI, [{ id: 'lavage', prixXof: 10_000, ferme: true }, { id: 'reprise', prixXof: 20_000, ferme: true }], [{ xof: 1000 }, null])?.remisesLignes);
  dit('rien quand rien ne mord : un geste non couvert, un prix sur devis', [null, null],
    [poseLOffreDuJour(MERCREDI, [{ id: 'styling', prixXof: 2_000, ferme: true }]), poseLOffreDuJour(MERCREDI, [{ id: 'lavage', prixXof: 0, ferme: false }])]);
  dit('rouvrir un rendez-vous du mercredi rend les remises de la main seules', [null, { pct: 10 }, { pct: 15, xof: 500 }],
    remisesDeLaMainSeules({ codeOffre: 'MERCREDI15', serviceIds: ['lavage', 'styling', 'reprise'], remisesLignes: [{ pct: 15 }, { pct: 10 }, { pct: 15, xof: 500 }] }, [MERCREDI]));
  dit('... et laisse intactes celles d un autre code', [{ pct: 15 }],
    remisesDeLaMainSeules({ codeOffre: 'ROSE15', serviceIds: ['lavage'], remisesLignes: [{ pct: 15 }] }, [MERCREDI, ROSE]));
  dit('MERCREDI15 est un code du jour, ROSE15 non', [true, false], [estUnCodeDuJour('mercredi15', [MERCREDI, ROSE]), estUnCodeDuJour('ROSE15', [MERCREDI, ROSE])]);
}

/* ══ 7. Le net monte au millier ══ */
dit('PANNE « pas d arrondi » : 8 500 F montent a 9 000 F, 9 000 F restent, jamais plus que la remise', [500, 0, 50, 0],
  [arrondiDuNet(8_500, 1_500), arrondiDuNet(9_000, 1_000), arrondiDuNet(8_950, 50), arrondiDuNet(10_000, 0)]);
{
  const sv = (id: string, priceXof: number) => ({ id, name: id, priceXof }) as unknown as Service;
  const byId = new Map<string, Service>([['lavage', sv('lavage', 10_000)], ['styling', sv('styling', 2_000)]]);
  const pose = poseLOffreDuJour(MERCREDI, [{ id: 'lavage', prixXof: 10_000, ferme: true }])!;
  const rdv = { id: 'r1', clientId: '', status: 'confirmé', date: MER_4, time: '13:00', serviceIds: ['lavage'], ...pose } as unknown as Appointment;
  dit('le Carnet lit le lavage du mercredi a 9 000 F, au total comme au net', [9_000, 9_000], [apptTotalXof(rdv, byId), apptNetXof(rdv, byId)]);
  const retire = remiseDeLOffreSurLeTicket(MERCREDI, [{ serviceId: 'lavage', montantXof: 10_000 }]).retire;
  const t = leTicket({ sousTotalXof: 10_000, prestationsXof: 10_000, remisePct: 0, remiseXof: 0, remiseDuRendezVousXof: 0, dejaRecuXof: 0, promoBrutXof: retire, nomDuCode: 'MERCREDI15' });
  dit('la Caisse : 10 000 F, MERCREDI15 a 1 500 F, net 9 000 F, l arrondi rend 500 F', [1_500, 9_000, 500], [retire, t.netXof, t.arrondiXof]);
  dit('... et la piece le dit', 'MERCREDI15 · 15 % hors gamme, arrondi au millier', libelleDuCode('MERCREDI15', 15, t.arrondiXof));
}
dit('l offre du jour ne se propose pas a la Caisse comme une offre de saison (elle se pose d elle-meme)', null,
  offreAProposer([MERCREDI], [{ serviceId: 'lavage', montantXof: 10_000 }], { codeTape: '', maintenant: MERCREDI_11 }));

/* ══ 8. La Caisse l'applique ══ */
{
  const caisse = source('src/apps/trone/routes/vente/Caisse.tsx');
  dit('PANNE « la Caisse l oublie » : la case vide prend le code du mercredi, la venue juge, rien par-dessus un code ni un rituel couvert',
    [true, true, true, true, true, true, true], [
      /const venueDuTicket = rituelDuTicket\?\.date \?\? dateVente;/.test(caisse),
      /const offreDuMercredi = !codeSaisi\.trim\(\) \? offreDuJourDeLaVenue\(offresDeLaBranche, \{/.test(caisse),
      /dejaUnCode: !!rituelDuTicket\?\.codeOffre,/.test(caisse),
      /couvertParAbonnement: !!rituelDuTicket\?\.coveredBySub \|\| \(rituelDuTicket\?\.seriesIndex \?\? 1\) > 1,/.test(caisse),
      /const codeTape = codeSaisi\.trim\(\) \? codeSaisi : \(offreDuMercredi\?\.code \?\? ''\);/.test(caisse),
      /offreDuCode\(offresDeLaBranche, codeTape, new Date\(\), venueDuTicket\)/.test(caisse),
      /discountLabel: libelleDuCode\(offreCodee\.code/.test(caisse),
    ]);
  dit('... et la caissiere peut l ecarter', true, /onClick=\{\(\) => setMercrediEcarteSur\(cleDuTicket\)\}>Ne pas l’appliquer/.test(caisse));
}

/* ══ 9. La fenetre du rendez-vous le pose, et le dit ══ */
{
  const s = source('src/apps/trone/routes/clients/_shared.tsx');
  dit('le rendez-vous du mercredi recoit le code, hors abonnement, hors forfait, jamais par-dessus un autre code',
    [true, true, true, true, true], [
      /const offreDuMercredi = rdvFige \? null : offreDuJourDeLaVenue\(offresDeLaMaison, \{\s*branchId: branch\.id, dateIso: date, serviceIds,/.test(s),
      /dejaUnCode: !!codeDuRdv,/.test(s),
      /couvertParAbonnement: effCovered \|\| estSuite \|\| \(appt\?\.seriesIndex \?\? 1\) > 1,/.test(s),
      /forfait: forfaitOn && String\(forfaitStr\)\.trim\(\) !== '',/.test(s),
      /const remisesL = poseDuMercredi\?\.remisesLignes \?\? remisesALaMain;/.test(s),
    ]);
  dit('il s ecrit a l enregistrement, en creation comme en modification, et s en va avec la date', [true, true, true], [
    /\.\.\.\(poseDuMercredi \? \{ codeOffre: poseDuMercredi\.codeOffre, \.\.\.\(poseDuMercredi\.offreId \? \{ offreId: poseDuMercredi\.offreId \} : \{\}\) \} : \{\}\),/.test(s),
    /\? \{ codeOffre: poseDuMercredi\.codeOffre, offreId: poseDuMercredi\.offreId \}\s*: !rdvFige && estUnCodeDuJour\(x\.codeOffre, offresDeLaMaison\) \? \{ codeOffre: undefined, offreId: undefined \} : \{\}\),/.test(s),
    /horsOffreDuJour: mercrediEcarte \|\| undefined,/.test(s),
  ]);
  dit('le prix fige monte au millier comme le Carnet', [true, true, true], [
    /const grossXof = keepFrozen \? \(frozenXof as number\) : grossBase \+ arrondiDuCode;/.test(s),
    /priceXof: effCovered \? 0 : needsAmount \? effGross : keepFrozen \? frozenXof : grossBase \+ arrondiDuCode,/.test(s),
    /priceXof: effCovered \? 0 : needsAmount \? effGross : grossBase \+ arrondiDuCode,/.test(s),
  ]);
  dit('l ecran le dit, et le comptoir garde la main', [true, true], [
    /Il se pose de lui-même sur un rendez-vous de ce jour\./.test(s),
    /onClick=\{\(\) => setMercrediEcarte\(true\)\}>Ne pas l’appliquer/.test(s),
  ]);
}

/* ══ 10. Ma Couronne le marque en cuivre, et le pose ══ */
{
  const b = source('src/apps/couronne/Booking.tsx');
  dit('PANNE « Ma Couronne ne marque pas le mercredi » : la case du calendrier et la place portent « −15 % »', [true, true, true, true], [
    /const duJour = c\.free && \(totalSessions === 1 \|\| sessionDates\.length === 0\) \? leMercrediPour\(c\.iso\) : null;/.test(b),
    /\$\{duJour \? ' is-offre' : ''\}/.test(b),
    /\{duJour && <small className="mc-calday__offre">−\{duJour\.discountPct \?\? 0\} %<\/small>\}/.test(b),
    /\{duJour && <small className="mc-place__offre">/.test(b),
  ]);
  dit('le prix montre porte la remise et l arrondi, une offre pre-remplie l ecarte', [true, true, true], [
    /const remiseMercredi = Math\.max\(0, duMercredi\.retire - arrondiDuNet\(duMercredi\.net, duMercredi\.retire\)\);/.test(b),
    /prix: Math\.max\(0, Math\.round\(\(connu - remiseMercredi\) \* \(1 - discountPct \/ 100\)\) - remiseFamille\),/.test(b),
    /dejaUnCode: discountPct > 0,/.test(b),
  ]);
  dit('le rendez-vous pose porte le code et ses remises', true,
    /\.\.\.\(i === 0 && poseDuMercredi \? \{\s*codeOffre: poseDuMercredi\.codeOffre,[\s\S]{0,120}remisesLignes: poseDuMercredi\.remisesLignes,/.test(b));
  dit('le cuivre suit le theme', true, /\.mc-calday\.is-offre \{[^}]*var\(--mc-cuivre-texte\)/.test(source('src/apps/couronne/couronne.css')));
  dit('la carte d offre ne pre-remplit pas sa remise un samedi', true,
    /discountPct: porteSurLeJourDeLaVenue\(o\) \? 0 : \(o\.discountPct \?\? 0\),/.test(source('src/apps/couronne/lib.ts')));
}

/* ══ 11. Le site aussi ══ */
{
  const r = source('src/apps/revelateur/ilots/Reserver.tsx');
  dit('le site juge le code sur le jour choisi, pose le mercredi sans code tape, l arrondit, et l envoie', [true, true, true, true, true, true], [
    /offreDuCode\(offres, code, new Date\(\), jour \|\| null\)/.test(r),
    /const unAutreCode = !!offreDuMoment \|\| FORME_DU_CODE\.test\(codeNormalise\(code\)\);/.test(r),
    /const offreAppliquee = offreDuMoment \?\? offreDeBienvenue \?\? offreDuJour;/.test(r),
    /const prixTotal = compte\.net \+ arrondi;/.test(r),
    /: offreDuJour\?\.code \? \{ code: codeNormalise\(offreDuJour\.code\) \} : \{\}\),/.test(r),
    (r.match(/\{duJour && <small className="remise-du-jour">/g) ?? []).length === 2,
  ]);
}

/* ══ 12. L'editeur des offres ══ */
{
  const e = source('src/apps/trone/routes/equipe/EditeurDesOffres.tsx');
  dit('le champ « Jours de la venue » s ouvre, se coche et s enregistre', [true, true, true], [
    /<Field label="Jours de la venue · laisser vide si l’offre vaut chaque jour">/.test(e),
    /joursDeLaVenue: \[\.\.\.\(o\.joursDeLaVenue \?\? \[\]\)\],/.test(e),
    /joursDeLaVenue: offerForm\.joursDeLaVenue\.length\s*\? OFFER_DAYS\.filter\(\(d\) => offerForm\.joursDeLaVenue\.includes\(d\)\)\s*: undefined,/.test(e),
  ]);
}

/* ══ 13. Le serveur du site (demande-submit) ══ */
{
  const texte = brut('supabase/functions/demande-submit/index.ts');
  const lu = sansCommentaires(texte);
  dit('le serveur juge le code sur la date du rendez-vous, et un mercredi vaut a chaque venue', [true, true, true], [
    /offreDuCode\(candidates, code, jourDeLaMaison\(\), o\.date \?\? null\)/.test(lu),
    /remiseDuCode\(\{ code: codeEcrit, serviceIds, branchId, catalogue: verdict\.catalogue, offres: verdict\.offres, date \}\)/.test(lu),
    /if \(duCode\.remisesLignes && !duCode\.chaqueVenue && await codeDejaUtilise\(duCode\.code, telephone\)\)/.test(lu),
  ]);
  const bloc = texte.slice(texte.indexOf('/* ══ COPIE DE offres-pur : DÉBUT ══ */'), texte.indexOf('/* ══ COPIE DE offres-pur : FIN ══ */'));
  const blocR = texte.slice(texte.indexOf('/* ══ RÉSOLUTION DU CODE : DÉBUT ══ */'), texte.indexOf('/* ══ RÉSOLUTION DU CODE : FIN ══ */'));
  const { transform } = await import(pathToFileURL(path.join(racine, 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
  const { code: js } = await transform(`${bloc}${blocR}\nexport { offreDuCode, laVenueTombeBien, jourDeLaSemaine, remiseDuCode };`, { loader: 'ts', format: 'esm' });
  const banc = mkdtempSync(path.join(os.tmpdir(), 'mercredi-au-serveur-'));
  const fichier = path.join(banc, 'copie.mjs');
  writeFileSync(fichier, js);
  type Copie = {
    offreDuCode: (o: readonly any[], c: unknown, j: string, v?: string | null) => any;
    laVenueTombeBien: (o: any, d: string | null | undefined) => boolean;
    jourDeLaSemaine: (d: unknown) => string | null;
    remiseDuCode: (o: any) => { code: string; offreId?: string; chaqueVenue?: boolean; remisesLignes?: ({ pct: number } | null)[]; raison?: string };
  };
  let copie: Copie;
  try { copie = await import(pathToFileURL(fichier).href); } finally { rmSync(banc, { recursive: true, force: true }); }
  const CAS: [string, string | null][] = [['2026-11-10', '2026-11-11'], ['2026-11-11', JEU_12], ['2026-11-02', MER_4], ['2026-11-02', MAR_3], ['2026-12-30', '2027-01-06'], ['2026-11-11', null]];
  dit('la copie juge chaque venue comme l original', CAS.map(([j, v]) => ID(offreDuCode([MERCREDI, ROSE], 'MERCREDI15', new Date(`${j}T10:00:00`), v))),
    CAS.map(([j, v]) => ID(copie.offreDuCode([MERCREDI, ROSE], 'MERCREDI15', j, v))));
  dit('... et lit les jours comme lui', [MER_4, MAR_3, '2026-11-01', 'x'].map((d) => jourDeLaSemaine(d)), [MER_4, MAR_3, '2026-11-01', 'x'].map((d) => copie.jourDeLaSemaine(d)));
  const CATALOGUE = [{ id: 'lavage', data: { priceXof: 10_000, priceMode: 'fixe' } }, { id: 'styling', data: { priceXof: 2_000, priceMode: 'fixe' } }];
  const verdict = (date?: string) => copie.remiseDuCode({ code: 'MERCREDI15', serviceIds: ['lavage', 'styling'], branchId: LA_MAISON, catalogue: CATALOGUE, offres: [MERCREDI], date });
  dit('le serveur remise le lavage d un mercredi, et le dit valable a chaque venue',
    { code: 'MERCREDI15', offreId: 'of-mercredi15', chaqueVenue: true, remisesLignes: [{ pct: 15 }, null] }, verdict(MER_4));
  dit('... un mardi, ou sans date, MERCREDI15 ne court pas', ['inconnu', 'inconnu'], [verdict(MAR_3).raison, verdict(undefined).raison]);
}

/* ══ 14. Le reglage SQL ══ */
{
  const sql = brut('supabase/reglage_mercredi_de_la_maison_20261102.sql').replace(/--[^\n]*/g, '');
  dit('d abord la copie de repli, RLS aussitot', [true, true], [
    /create table if not exists public\.repli_mnd_offers_20261102 as\s+select \* from public\.documents where key = 'mnd_offers';/.test(sql),
    /alter table public\.repli_mnd_offers_20261102 enable row level security;/.test(sql),
  ]);
  dit('l offre telle que decidee', Array(13).fill(true), [
    /'id', 'of-mercredi15'/.test(sql), /'branchId', 'br-40r6u6frno'/.test(sql), /'title', 'Le mercredi de la Maison'/.test(sql),
    /'tag', 'Le mercredi'/.test(sql), /'deal', '−15 %'/.test(sql), /'joursDeLaVenue', '\["Mer"\]'::jsonb/.test(sql),
    /'days', '\["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"\]'::jsonb/.test(sql), /'du', '2026-11-04'/.test(sql), /'au', '2026-12-31'/.test(sql),
    /'code', 'MERCREDI15'/.test(sql), /'discountPct', 15,/.test(sql), /'active', true/.test(sql), /'serviceIds', gestes\.ids/.test(sql),
  ]);
  dit('rejouable : rien ne s ajoute si MERCREDI15 existe deja', true,
    /and not exists \(\s*select 1 from jsonb_array_elements\(coalesce\(d\.data, '\[\]'::jsonb\)\) e\s*where upper\(coalesce\(e->>'code', ''\)\) = 'MERCREDI15'\s*\);/.test(sql));
  const liste = sql.slice(sql.indexOf('where s.id in ('), sql.indexOf('and coalesce((s.data'));
  const ids = [...liste.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const interdits = ids.filter((id) => /^(sv-forfait-|sv-fft-|sv-aca-|sv-venue-|sv-le-moment|sv-plt-60-pc|sv-kids-naissance|sv-kids-rituel|sv-kids-vekpe|sv-gbigbi-cure-trois|sv-plt-30-cur|sv-atl-i-|sv-sup-60|x1e5usbmzc)/.test(id));
  dit('61 prestations, sans doublon, ni formule, ni forfait, ni paquet, ni Academie, ni creation, ni produit', [61, 61, []], [ids.length, new Set(ids).size, interdits]);
  dit('les prestations archivees tombent d elles-memes', true, /and coalesce\(\(s\.data->>'archived'\)::boolean, false\) = false/.test(sql));
  dit('rien de destructif', null, /\b(drop\s+table|drop\s+schema|truncate|delete\s+from|drop\s+column)\b/i.exec(sql)?.[0] ?? null);
  const lus = [...sql.matchAll(/'(sub|conditions|title|tag|deal|bouton)', '([^']*)'/g)].map((m) => m[2]);
  dit('les mots lus par la cliente : ni tiret long, ni maitre, ni salon', [], lus.filter((t) => /—|ma[iî]tre|\bsalons?\b/i.test(t)));
}

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
