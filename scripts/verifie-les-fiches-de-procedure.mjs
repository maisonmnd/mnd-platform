import { build } from 'esbuild';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES FICHES DE PROCEDURE, EPROUVEES - 25 novembre 2026.
   « Cree une fiche de procedure par soin du catalogue, en commencant par le
   Rituel SOWA. Utilise le meme format pour chaque fiche. Signale les
   informations a valider… Relie chaque fiche a la prestation correspondante
   et ajoute un bouton Voir le protocole dans le rendez-vous. L'equipe doit
   pouvoir consulter la version validee sans quitter le rendez-vous », puis,
   le meme jour : « Decide et valide la fiche Sowa. Cree des descriptions pour
   tous : va faire tes recherches » (Yeman).

   Ce banc tient, contre le module pur, les fiches ecrites et les ecrans :
   · LE FORMAT : sept rubriques, toujours les memes, toujours dans cet ordre ;
   · LA VERSION VALIDEE : l'equipe ne lit jamais un brouillon ; une version
     validee est une copie figee, numerotee, signee ; une fiche validee se
     garde sans brouillon (la memoire de chaque poste) et le retrouve a la
     lecture ; le code ne porte plus aucune fiche ;
   · LE LIEN : par l'identifiant de la prestation, puis par son code sans
     longueur ; les prestations comprises dans un forfait suivent ;
   · LA FICHE SOWA DECIDEE : Pouxit XF en lotion, 6 mois, 15 minutes sur
     cheveux secs, le shampoing sans mouiller, ni flamme ni chaleur, pas sur
     peau lesee ; la seconde application au controle de J+7 ; neem et
     shikakai hors du rituel ; le flacon verifie d'abord, la notice de la
     boite fait foi ; plus rien « a valider », sauf la forme de la Couronne
     Cocon ;
   · LES FICHES ECRITES (scripts/fiches-de-procedure/familles) : chaque ligne
     dit son origine, aucun chiffre de la pratique sans reference, sept
     rubriques pleines, ni emoji ni tiret cadratin ;
   · LES BRANCHEMENTS : le bouton « Voir le protocole », sa fenetre
     par-dessus, le Catalogue, le magasin, la migration 0244, les gardes du
     reglage.

   `--prouve` plante des pannes dans des COPIES (dossier temporaire, aucun
   fichier du depot touche) et exige que chacune fasse crier le banc.
   Lance : node scripts/verifie-les-fiches-de-procedure.mjs [--prouve]
   Sortie ASCII : la console de Windows. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8');
const SOURCE = 'src/shared/fiches-de-procedure-pur.ts';
const ECRITES = 'scripts/fiches-de-procedure';
const d = mkdtempSync(path.join(tmpdir(), 'fiches-proc-'));

const MAGASIN = lis('src/shared/fiches-de-procedure.ts');
const LECTURE = lis('src/apps/trone/routes/vente/FicheDeProcedure.tsx');
const ATELIER = lis('src/apps/trone/routes/vente/FichesDeProcedure.tsx');
const RDV = lis('src/apps/trone/routes/clients/_shared.tsx');
const CATALOGUE = lis('src/apps/trone/routes/vente/Catalogue.tsx');
const SQL = lis('supabase/migrations/0244_les_fiches_de_procedure.sql');
const BESOINS = lis('src/shared/besoins-pur.ts');
const REGLAGE = lis(`${ECRITES}/reglage.mjs`);

let numero = 0;
async function chargeLePur(source) {
  numero += 1;
  const ts = path.join(d, `pur-${numero}.ts`);
  const out = path.join(d, `pur-${numero}.mjs`);
  writeFileSync(ts, source);
  await build({ entryPoints: [ts], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

/** Les fiches ecrites, lues dans un dossier (le vrai, ou une copie ou l'on a plante une panne).
    Le catalogue est une doublure : ce banc n'a pas de reseau. */
const FAMILLES = ['couleur', 'kids-studio-beaute', 'lavages', 'locks', 'soins', 'sorties-et-options', 'sowa'];
async function chargeLesEcrites(dossier) {
  const de = (f) => import(pathToFileURL(path.join(dossier, f)).href);
  const outils = await de('outils.mjs');
  const offertes = await de('prestations-offertes.mjs');
  const refs = await de('refs.mjs');
  const cat = {
    sv: (id) => ({ id, name: id, sessions: 2 }), nom: (id) => id, existe: () => true,
    duree: () => '1 h', dureeParLongueur: () => 'court 1 h, long 2 h', dureeDite: () => '1 h', comprisDans: () => [], soins: [],
  };
  const fiches = [];
  for (const f of FAMILLES) for (const x of (await de(`familles/${f}.mjs`)).default(cat)) fiches.push({ ...x, famille: f });
  return { outils, offertes, refs, fiches };
}

/** Les epreuves. Rend la liste des echecs. */
function epreuves(m, e, parle) {
  const echecs = [];
  const dit = (nom, attendu, obtenu) => {
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) echecs.push(nom);
    if (parle) {
      console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`);
      if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
    }
  };
  const ORDRE = ['objectif', 'public', 'produits', 'arrivee', 'etapes', 'conseils', 'suivi'];
  const SOWA = m.ID_DU_RITUEL_SOWA;
  const tous = (c) => ORDRE.flatMap((r) => (c[r] ?? []).map((l) => ({ ...l, rubrique: r })));
  /* Une fiche d'exemple, pour les regles de version. */
  const exemple = () => ({
    serviceId: 'sv-exemple', titre: 'Soin d exemple',
    brouillon: { ...m.contenuVide(), etapes: [{ id: 'e1', texte: 'Premier geste' }, { id: 'e2', texte: 'Pose', detail: 'Selon la notice', aValider: 'Durée à recopier' }], produits: [{ id: 'p1', texte: 'Un produit', source: 'notice', ref: 'Notice · exemple.test/notice' }] },
  });

  /* ── A. Le format ── */
  dit('A1 sept rubriques, dans l ordre demande', ORDRE, m.RUBRIQUES.map((r) => r.id));
  dit('A2 leurs titres', [
    'Objectif', 'Public', 'Produits et références', 'Vérifications à l’arrivée',
    'Étapes et temps de pose validés', 'Conseils après le soin', 'Inclusions et suivi',
  ], m.RUBRIQUES.map((r) => r.titre));
  dit('A3 un contenu abime revient complet, une rubrique inconnue est ecartee', ORDRE,
    Object.keys(m.contenuSur({ etapes: [{ texte: 'Une etape' }, null, 7], huitieme: [{ texte: 'x' }], objectif: 'pas une liste' })));
  dit('A4 une ligne vide ne se garde pas, une ligne signalee se garde', [1, 'Durée à écrire'],
    (() => { const c = m.contenuSur({ etapes: [{ texte: '  ' }, { texte: '', aValider: 'Durée à écrire' }] }); return [c.etapes.length, c.etapes[0]?.aValider]; })());
  dit('A5 seules deux rubriques portent une seconde case (reference, temps de pose)', ['produits', 'etapes'], m.RUBRIQUES.filter((r) => !!r.detail).map((r) => r.id));
  dit('A6 une ligne garde son origine et sa reference ; une origine inconnue est ecartee', [['notice', 'Notice · x.test'], [undefined, undefined]],
    (() => { const c = m.contenuSur({ produits: [{ texte: 'A', source: 'notice', ref: 'Notice · x.test' }, { texte: 'B', source: 'rumeur' }] }); return c.produits.map((l) => [l.source, l.ref]); })());
  dit('A7 cinq origines, pas une de plus', ['catalogue', 'laboratoire', 'maison', 'notice', 'pratique'], [...m.ORIGINES_DES_LIGNES]);

  /* ── D. La version validee ── */
  dit('D1 le code ne porte plus aucune fiche : le document fait foi', {}, m.FICHES_DE_DEPART());
  dit('D2 l equipe ne lit pas un brouillon ; la direction, si', [null, 'brouillon'],
    [m.lectureDeLaFiche(exemple(), false), m.lectureDeLaFiche(exemple(), true)?.version]);
  const v1 = m.valideLaFiche(exemple(), 'La Direction', '2026-11-25T10:00:00.000Z');
  dit('D3 valider : version 1, signee, datee', [1, 'La Direction', '2026-11-25T10:00:00.000Z'],
    'fiche' in v1 ? [v1.fiche.validee.numero, v1.fiche.validee.par, v1.fiche.validee.le] : [v1.refus]);
  const f1 = 'fiche' in v1 ? v1.fiche : exemple();
  dit('D4 l equipe lit alors la version validee, avec son point signale', ['validee', 1],
    [m.lectureDeLaFiche(f1, false)?.version, m.pointsAValider(m.lectureDeLaFiche(f1, false)?.contenu ?? m.contenuVide()).length]);
  /* La version validee est une COPIE : toucher au brouillon, meme en place, ne la change pas. */
  const avant = JSON.stringify(f1.validee?.contenu);
  if (f1.brouillon.etapes[0]) f1.brouillon.etapes[0].texte = 'Etape corrigee au brouillon';
  dit('D5 corriger le brouillon ne change pas ce que lit l equipe', [avant, 'validee-et-brouillon'],
    [JSON.stringify(m.lectureDeLaFiche(f1, false)?.contenu), m.etatDeLaFiche(f1)]);
  const v2 = m.valideLaFiche(f1, 'La Direction', '2026-11-26T10:00:00.000Z');
  dit('D6 valider de nouveau : version 2, le brouillon corrige', [2, 'Etape corrigee au brouillon', 'validee'],
    'fiche' in v2 ? [v2.fiche.validee.numero, v2.fiche.validee.contenu.etapes[0].texte, m.etatDeLaFiche(v2.fiche)] : [v2.refus]);
  dit('D7 sans nom, pas de validation', true, 'refus' in m.valideLaFiche(exemple(), '  ', '2026-11-25T10:00:00.000Z'));
  dit('D8 sans etape, pas de validation', true,
    'refus' in m.valideLaFiche({ ...exemple(), brouillon: m.contenuVide() }, 'La Direction', '2026-11-25T10:00:00.000Z'));
  dit('D9 la signature se dit', 'Version 1, validée le 25 nov. 2026 par La Direction',
    m.signatureDeLaVersion({ numero: 1, le: 'x', par: 'La Direction', contenu: m.contenuVide() }, () => '25 nov. 2026'));

  /* ── E. Ce que le document garde ── */
  const validee = 'fiche' in m.valideLaFiche(exemple(), 'La Direction', '2026-11-25T10:00:00.000Z') ? m.valideLaFiche(exemple(), 'La Direction', '2026-11-25T10:00:00.000Z').fiche : exemple();
  dit('E1 une fiche validee, brouillon inchange, se garde sans brouillon', [false, true],
    [Object.hasOwn(m.ficheAllegee(validee), 'brouillon'), Object.hasOwn(m.ficheAllegee(validee), 'validee')]);
  dit('E2 … et le retrouve a la lecture, identique a sa version', [true, 'validee'],
    (() => { const lue = m.fichesSures({ x: JSON.parse(JSON.stringify(m.ficheAllegee(validee))) }).x; return [JSON.stringify(lue.brouillon) === JSON.stringify(lue.validee.contenu), m.etatDeLaFiche(lue)]; })());
  dit('E3 un brouillon corrige se garde', true, Object.hasOwn(m.ficheAllegee(f1), 'brouillon'));
  dit('E4 un brouillon jamais valide se garde', true, Object.hasOwn(m.ficheAllegee(exemple()), 'brouillon'));
  dit('E5 un document vide ou abime se lit sans fiche, sans planter', [{}, {}, {}], [null, [], { autre: 'pas une fiche' }].map((brut) => m.fichesSures(brut)));
  dit('E6 une version validee sans numero ni date n en est pas une', undefined,
    m.fichesSures({ x1: { titre: 'T', brouillon: {}, validee: { contenu: {} } } }).x1.validee);

  /* ── F. Le lien avec la prestation ── */
  const fiches = {
    [SOWA]: { ...validee, serviceId: SOWA },
    'sv-a-c': { serviceId: 'sv-a-c', code: 'PLT·99', titre: 'Soin A', brouillon: m.contenuVide(), validee: { numero: 1, le: '2026-11-25T10:00:00.000Z', par: 'D', contenu: { ...m.contenuVide(), etapes: [{ id: 'e1', texte: 'Geste' }] } } },
    'sv-b': { serviceId: 'sv-b', titre: 'Soin B', brouillon: { ...m.contenuVide(), etapes: [{ id: 'e1', texte: 'Geste' }] } },
  };
  const catalogue = new Map([
    { id: SOWA, name: 'Rituel Sówà™' },
    { id: 'sv-a-c', name: 'Soin A · Court', code: 'PLT·99·C' },
    { id: 'sv-a-l', name: 'Soin A · Long ou haute densité', code: 'PLT·99·L' },
    { id: 'sv-b', name: 'Soin B' },
    { id: 'sv-b-bis', name: 'Soin B', code: 'PLT·77·C' },
    { id: 'sv-forfait', name: 'Le Forfait', includes: [{ serviceId: 'sv-a-l' }, { serviceId: SOWA, offert: true }, { serviceId: '' }] },
  ].map((s) => [s.id, s]));
  dit('F1 la fiche par l identifiant de la prestation', SOWA, m.ficheDeLaPrestation(fiches, catalogue.get(SOWA))?.serviceId);
  dit('F2 une soeur de longueur lit la meme fiche (code sans longueur)', 'sv-a-c', m.ficheDeLaPrestation(fiches, catalogue.get('sv-a-l'))?.serviceId);
  dit('F3 un nom qui ressemble ne relie pas', undefined, m.ficheDeLaPrestation(fiches, catalogue.get('sv-b-bis')));
  dit('F4 au rendez-vous, l equipe : les fiches validees seulement, dans l ordre', [SOWA, 'sv-a-c'],
    m.fichesDuRendezVous(['sv-b', SOWA, 'sv-a-l', 'sv-a-c'], catalogue, fiches, false).map((l) => l.fiche.serviceId));
  dit('F5 au rendez-vous, la direction lit aussi le brouillon', [['sv-b', 'brouillon'], [SOWA, 'validee']],
    m.fichesDuRendezVous(['sv-b', SOWA], catalogue, fiches, true).map((l) => [l.fiche.serviceId, l.version]));
  dit('F6 un forfait apporte les fiches de ce qu il comprend, une fois chacune', [['sv-a-c', 'Le Forfait'], [SOWA, 'Le Forfait']],
    m.fichesDuRendezVous(['sv-forfait'], catalogue, fiches, false).map((l) => [l.fiche.serviceId, l.viaLeForfait]));
  dit('F7 sans fiche a lire, rien : le bouton ne parait pas', [], m.fichesDuRendezVous(['sv-b', 'sv-inconnue'], catalogue, fiches, false));
  dit('F8 le bouton dit le soin et ses points a valider', 'Rituel Sówà™ · 1 point à valider', m.ceQueDitLeBouton(m.fichesDuRendezVous([SOWA], catalogue, fiches, false)));
  dit('F9 le bouton dit un brouillon a la direction', 'Soin B · brouillon, pas encore validé', m.ceQueDitLeBouton(m.fichesDuRendezVous(['sv-b'], catalogue, fiches, true)));

  /* ── G. La fiche de depart d'un soin, lue au catalogue (l'ecran de la direction) ── */
  const depart = m.ficheDepuisLeCatalogue({
    id: 'sv-x-m', code: 'PLT·10·M', name: 'DÀNDÀN™ · L’hydratation · Mi-Long', durationMin: 60, sessions: 1,
    description: 'DÀNDÀN™ : l’hydratation.\nUn soin pensé pour nourrir vos locks en profondeur, à la vapeur.\n\nVous en retirez : des locks souples et nourries.\n\nÀ choisir quand : vos cheveux sont secs.',
    includes: [{ serviceId: 'sv-b', afterWeeks: 8, offert: true }],
  }, (id) => catalogue.get(id)?.name);
  const D = depart.brouillon;
  dit('G1 meme format : sept rubriques, aucune vide', [ORDRE, []], [Object.keys(D), m.rubriquesVides(D)]);
  dit('G2 reliee a la prestation, par son identifiant et son code sans longueur', ['sv-x-m', 'PLT·10', 'DÀNDÀN™ · L’hydratation'], [depart.serviceId, depart.code, depart.titre]);
  dit('G3 aucune etape ni temps de pose invente : tout est signale, aucune seconde case remplie', [true, 0],
    [D.etapes.every((l) => !!l.aValider), D.etapes.filter((l) => !!l.detail).length]);
  dit('G4 les seuls chiffres sont ceux du catalogue', ['8'], tous(D).map((l) => `${l.texte} ${l.detail ?? ''}`).join(' ').match(/\d+/g) ?? []);
  dit('G5 jamais validee d office', [undefined, null], [depart.validee, m.lectureDeLaFiche(depart, false)]);

  /* ── S. La fiche Sowa, decidee ── */
  const sowa = e.fiches.find((f) => f.pour.includes(SOWA));
  const controle = e.fiches.find((f) => f.pour.includes(e.offertes.ID_DU_CONTROLE_SOWA));
  const cocon = e.fiches.find((f) => f.pour.includes(e.offertes.ID_DE_LA_COURONNE_COCON));
  const S = sowa?.contenu ?? m.contenuVide();
  const a = (c, r, motif, origine) => (c[r] ?? []).some((l) => motif.test(`${l.texte} ${l.detail ?? ''}`) && (!origine || l.source === origine));
  const idDesBesoins = BESOINS.match(/sowa:\s*'([a-z0-9]+)'/)?.[1] ?? 'introuvable';
  dit('S1 reliee au Rituel Sowa du catalogue (le meme identifiant que les besoins)', [idDesBesoins, idDesBesoins], [SOWA, e.offertes.ID_DU_RITUEL_SOWA]);
  dit('S2 tout est decide : plus aucun point a valider dans la fiche Sowa ni dans son controle', [0, 0],
    [tous(S).filter((l) => !!l.aValider).length, tous(controle?.contenu ?? {}).filter((l) => !!l.aValider).length]);
  dit('S3 la reference : Pouxit XF, en lotion, d apres la page du fabricant', true,
    S.produits.some((l) => /^Pouxit XF, lotion en flacon/.test(l.texte) && l.source === 'notice' && /pouxit\.fr/.test(l.ref ?? '') && /Pouxit XF lotion/.test(l.detail ?? '')));
  dit('S4 le temps de pose : 15 minutes, d apres la notice, et rien d autre', [['15 minutes'], 'notice'],
    [[...new Set(S.etapes.filter((l) => /minutes?/.test(l.detail ?? '')).map((l) => l.detail))], S.etapes.find((l) => l.detail === '15 minutes')?.source]);
  dit('S5 la dose n est pas inventee : la notice n en donne pas, la fiche le dit', true, a(S, 'etapes', /la notice ne donne pas de dose/, 'notice'));
  dit('S6 l age : 6 mois, au public et a l arrivee', [true, true], [a(S, 'public', /À partir de 6 mois/, 'notice'), a(S, 'arrivee', /6 mois révolus/, 'notice')]);
  dit('S7 sur cheveux secs, puis le shampoing sans mouiller', [true, true], [a(S, 'etapes', /locks et un cuir chevelu secs/, 'notice'), a(S, 'etapes', /Sans mouiller avant/, 'notice')]);
  dit('S8 ni flamme ni chaleur tant que le produit est sur la tete', true, a(S, 'arrivee', /Aucune flamme ni source de chaleur[\s\S]*ni casque, ni sèche-cheveux/, 'notice'));
  dit('S9 pas sur une peau lesee, pas en cas d allergie', [true, true], [a(S, 'arrivee', /peau lésée/, 'notice'), a(S, 'arrivee', /allergie à l’un de ses composants/, 'notice')]);
  dit('S10 le flacon se verifie d abord, et la notice de la boite fait foi', [true, true],
    [/^Le flacon en main est bien Pouxit XF, en lotion/.test(S.arrivee[0]?.texte ?? ''), /^La notice de la boîte fait foi/.test(S.arrivee[1]?.texte ?? '')]);
  dit('S11 neem et shikakai hors du rituel, la raison referencee', true,
    S.produits.some((l) => /Pouxit seul\. Ni poudre de neem ni poudre de shikakaï/.test(l.texte) && !!l.ref));
  dit('S12 la recommandation DANDAN : aux etapes, aux conseils, aux inclusions', [true, true, true],
    ['etapes', 'conseils', 'suivi'].map((r) => a(S, r, /DÀNDÀN™/) && a(S, r, /[Rr]ecommand/)));
  dit('S13 la Couronne Cocon, offerte aux enfants', [true, true], [a(S, 'suivi', /^Offert aux enfants : la coiffure protectrice Couronne Cocon/), a(S, 'etapes', /Pour un enfant : la Couronne Cocon, offerte/)]);
  dit('S14 le controle offert a J+7, ou se fait la seconde application', [true, true, true],
    [a(S, 'suivi', /^Offert : le contrôle à J\+7, où se fait la seconde application/), a(S, 'etapes', /contrôle, offert, à J\+7/), a(S, 'conseils', /J\+7[\s\S]*seconde application/)]);
  dit('S15 le controle : la seconde application entre le 7e et le 10e jour (SFD), les memes gestes', [true, true, true],
    [(controle?.contenu.objectif ?? []).some((l) => /entre le 7e et le 10e jour/.test(l.texte) && /dermato-info\.fr/.test(l.ref ?? '')),
      a(controle?.contenu ?? {}, 'etapes', /15 minutes/, 'notice'), a(controle?.contenu ?? {}, 'arrivee', /Aucune flamme ni source de chaleur/, 'notice')]);
  dit('S16 les conseils a la maison sont references (linge, peignes, entourage, ecole)', 4,
    S.conseils.filter((l) => l.source === 'pratique' && !!l.ref && /lavés à 60 °C|mis de côté 3 jours|têtes de toute la maison|l’école/.test(l.texte)).length);
  dit('S17 la Couronne Cocon : un seul point reste a valider, sa forme', [1, true],
    [tous(cocon?.contenu ?? {}).filter((l) => !!l.aValider).length, /forme exacte de la Couronne Cocon/.test(tous(cocon?.contenu ?? {}).find((l) => !!l.aValider)?.aValider ?? '')]);
  dit('S18 les deux prestations offertes : 0 F, le controle dans sa fenetre, la Couronne Cocon aux enfants', [[0, 0], { deSemaines: 1, aSemaines: 2 }, true],
    [e.offertes.PRESTATIONS_OFFERTES.map((p) => p.priceXof), e.offertes.PRESTATIONS_OFFERTES.find((p) => p.id === e.offertes.ID_DU_CONTROLE_SOWA)?.fenetreApresVenue,
      e.offertes.PRESTATIONS_OFFERTES.find((p) => p.id === e.offertes.ID_DE_LA_COURONNE_COCON)?.reserveEnfants]);

  /* ── T. Toutes les fiches ecrites ── */
  const defauts = e.fiches.flatMap((f) => e.outils.defautsDeLaFiche(f));
  dit('T1 aucune fiche ecrite n a de defaut (sept rubriques pleines, une origine par ligne, pas de chiffre de la pratique sans reference)', [], defauts.slice(0, 6));
  const vises = e.fiches.flatMap((f) => f.pour);
  dit('T2 77 prestations ont leur fiche ecrite a la main, aucune deux fois', [77, 77], [vises.length, new Set(vises).size]);
  dit('T3 chaque reference citee existe (aucune reference vide ou « undefined »)', [],
    e.fiches.flatMap((f) => tous(f.contenu).filter((l) => l.ref !== undefined && (!l.ref || /undefined/.test(l.ref) || !Object.values(e.refs.REFS).includes(l.ref))).map((l) => `${f.titre} : ${l.texte.slice(0, 40)}`)).slice(0, 5));
  dit('T4 une ligne « notice » cite toujours sa notice', [],
    e.fiches.flatMap((f) => tous(f.contenu).filter((l) => l.source === 'notice' && !l.ref).map((l) => `${f.titre} : ${l.texte.slice(0, 40)}`)).slice(0, 5));
  dit('T5 les fiches qui touchent a la chimie signalent le test d allergie et le cuir chevelu', [true, true],
    (() => { const t = e.fiches.find((f) => f.pour.includes('sv-atl-iii-sub-c')); const lignes = tous(t?.contenu ?? {}).map((l) => l.texte).join('\n'); return [/Test d’allergie fait au moins 48 heures avant/.test(lignes), /cuir chevelu sensible, irrité ou abîmé/.test(lignes)]; })());
  dit('T6 un bain detox ne depasse jamais ce que dit le Laboratoire', ['10 à 15 minutes, jamais plus'],
    [...new Set(e.fiches.flatMap((f) => tous(f.contenu)).filter((l) => /Immerger les longueurs/.test(l.texte)).map((l) => l.detail))]);

  /* ── H. Les branchements ── */
  dit('H1 le bouton « Voir le protocole » est dans la fenetre du rendez-vous, sur ses prestations', [true, true],
    [RDV.includes("import { VoirLeProtocole } from '../vente/FicheDeProcedure';"), RDV.includes('<VoirLeProtocole serviceIds={serviceIds} byId={byId} />')]);
  dit('H2 il s appelle « Voir le protocole » et ne parait que s il y a une fiche a lire', [true, true],
    [LECTURE.includes('<b>Voir le protocole</b>'), /if \(lues\.length === 0\) return null;/.test(LECTURE)]);
  dit('H3 sa fenetre se pose par-dessus le rendez-vous (portail), sans le fermer', [true, true],
    [/createPortal\(\s*<ProtocoleDuRendezVous lues=\{lues\} onClose=\{\(\) => setOuvert\(false\)\} \/>,\s*document\.body,/.test(LECTURE), LECTURE.includes('Revenir au rendez-vous')]);
  dit('H4 ce qui se lit au rendez-vous passe par la regle (l equipe : la version validee)', true,
    /fichesDuRendezVous\(serviceIds, byId, fiches, direction\)/.test(LECTURE) && LECTURE.includes('const direction = useEstDirection();'));
  dit('H5 le Catalogue ouvre « Les fiches de procedure »', [true, true],
    [CATALOGUE.includes('<FichesDeProcedureModal onClose={() => setFichesOuvertes(false)} />'), CATALOGUE.includes('>Les fiches de procédure</Button>')]);
  dit('H6 au Catalogue, l equipe ne voit que les fiches validees ; la direction seule corrige', [true, true],
    [ATELIER.includes("if (!direction && etat !== 'validee' && etat !== 'validee-et-brouillon') return false;"), /\) : direction \? \(\s*<EditeurDeLaFiche/.test(ATELIER)]);
  dit('H7 un seul document, ne vide, garde au plus leger, lie au serveur', [true, true, true],
    [MAGASIN.includes("createStore<LesFichesGardees>('mnd_fiches_de_procedure', {})"), MAGASIN.includes('bindDocument(fichesDeProcedureStore, CLE_DES_FICHES_DE_PROCEDURE);'),
      /* Les deux écritures (le brouillon, la validation) passent par `aGarder`. */
      (MAGASIN.match(/aGarder\(\{/g) ?? []).length === 2]);
  const regles = [...SQL.matchAll(/create policy (\w+) on public\.documents\s+as restrictive for (insert|update|delete) to anon, authenticated/g)].map((x) => x[2]);
  dit('H8 la base : trois regles restrictives, la direction seule ecrit le document', [['insert', 'update', 'delete'], 4],
    [regles, (SQL.replace(/--[^\n]*/g, '').match(/key <> 'mnd_fiches_de_procedure' or public\.est_direction\(\)/g) ?? []).length]);
  dit('H9 le reglage ne remplace ni une fiche validee ni un brouillon corrige par la direction, et fait son repli d abord', [true, true, true],
    [REGLAGE.includes("(d.data->n.key) ? 'validee'"), REGLAGE.includes("coalesce(d.data->n.key->>'brouillonPar', '') not in ('', ${sql(MARQUE_DE_LA_RECHERCHE)})"),
      REGLAGE.indexOf('create table if not exists public.${repli}') > 0 && REGLAGE.indexOf('create table if not exists public.${repli}') < REGLAGE.indexOf('update public.documents d')]);

  return echecs;
}

/* Les pannes : [nom, fichier (le module pur, ou un fichier des fiches ecrites), avant, apres]. */
const PANNES = [
  ['l equipe lit le brouillon', SOURCE, "return direction ? { fiche: f, contenu: f.brouillon, version: 'brouillon' } : null;", "return { fiche: f, contenu: f.brouillon, version: 'brouillon' };"],
  ['la version validee n est pas une copie', SOURCE, 'validee: { numero: (f.validee?.numero ?? 0) + 1, le, par: qui, contenu: copieDuContenu(contenu) },', 'validee: { numero: (f.validee?.numero ?? 0) + 1, le, par: qui, contenu },'],
  ['une validation sans nom passe', SOURCE, "if (!qui) return { refus: 'La validation porte un nom : votre compte n’en a pas.' };", ''],
  ['deux rubriques echangees', SOURCE, "  { id: 'objectif', titre: 'Objectif', aide: 'Ce que le soin doit obtenir.' },\n  { id: 'public', titre: 'Public', aide: 'Pour qui, et dans quel cas.' },", "  { id: 'public', titre: 'Public', aide: 'Pour qui, et dans quel cas.' },\n  { id: 'objectif', titre: 'Objectif', aide: 'Ce que le soin doit obtenir.' },"],
  ['un nom qui ressemble relie une fiche', SOURCE, 'return Object.values(fiches).find((f) => !!f.code && f.code === nu);', 'return Object.values(fiches).find((f) => (!!f.code && f.code === nu) || f.titre === (sv as { name?: string }).name);'],
  ['une fiche validee gardee sans brouillon se lit vide', SOURCE, 'brouillon: o.brouillon === undefined && validee ? copieDuContenu(validee.contenu) : contenuSur(o.brouillon),', 'brouillon: contenuSur(o.brouillon),'],
  ['le document garde deux fois une fiche validee', SOURCE, 'if (!f.validee || brouillonDiffere(f)) return f;', 'if (f.serviceId) return f;'],
  ['la fiche allegee perd un brouillon corrige', SOURCE, 'if (!f.validee || brouillonDiffere(f)) return f;', 'if (!f.validee) return f;'],
  ['le code reporte une fiche', SOURCE, 'export const FICHES_DE_DEPART = (): LesFiches => ({});', "export const FICHES_DE_DEPART = (): LesFiches => ({ x: { serviceId: 'x', titre: 'X', brouillon: contenuVide() } });"],
  ['une origine inventee passe', SOURCE, 'const source = ORIGINES_DES_LIGNES.find((x) => x === o.source);', 'const source = o.source as OrigineDeLaLigne | undefined;'],
  ['la fiche de depart invente un temps de pose', SOURCE, "    ligne('Étapes du fauteuil, dans l’ordre, et temps de pose.', 'À écrire par la direction. Aucune durée n’a été supposée.'),", "    ligne('Étapes du fauteuil, dans l’ordre, et temps de pose.', undefined, '20 minutes'),"],
  ['la pose du Pouxit passe a 30 minutes', `${ECRITES}/familles/sowa.mjs`, "N('Laisser agir.', { d: '15 minutes', ref: REFS.POUXIT_XF }),", "N('Laisser agir.', { d: '30 minutes', ref: REFS.POUXIT_XF }),"],
  ['une dose inventee', `${ECRITES}/familles/sowa.mjs`, "{ d: 'Assez pour tout recouvrir : la notice ne donne pas de dose', ref: REFS.POUXIT_XF }", "{ d: '50 ml par tête', ref: REFS.POUXIT_XF }"],
  ['l age minimum disparait', `${ECRITES}/familles/sowa.mjs`, "  N('Âge : 6 mois révolus au moins.', { ref: REFS.POUXIT_XF }),\n", ''],
  ['la chaleur n est plus interdite', `${ECRITES}/familles/sowa.mjs`, "  N('Aucune flamme ni source de chaleur près d’elle tant que le produit est sur la tête : ni casque, ni sèche-cheveux, ni cigarette.', { ref: REFS.POUXIT_XF_NOTICE }),\n", ''],
  ['le flacon ne se verifie plus', `${ECRITES}/familles/sowa.mjs`, "  M('Le flacon en main est bien Pouxit XF, en lotion.", "  M('Préparer le flacon."],
  ['le neem revient dans le rituel', `${ECRITES}/familles/sowa.mjs`, "M('Pouxit seul. Ni poudre de neem ni poudre de shikakaï dans le rituel :", "M('Pouxit, avec la poudre de neem si la cliente le souhaite :"],
  ['le controle perd sa seconde application', `${ECRITES}/familles/sowa.mjs`, "M('Offert : le contrôle à J+7, où se fait la seconde application.', { ref: REFS.POUX_SFD }),", "M('Offert : le contrôle à J+7.'),"],
  ['un chiffre de la pratique sans reference', `${ECRITES}/familles/sowa.mjs`, "P('Peignes et brosses : lavés, puis mis de côté 3 jours.', { ref: REFS.POUX_INRS }),", "P('Peignes et brosses : lavés, puis mis de côté 3 jours.'),"],
  ['un point a valider revient dans la fiche Sowa', `${ECRITES}/familles/sowa.mjs`, "N('Laisser agir.', { d: '15 minutes', ref: REFS.POUXIT_XF }),", "N('Laisser agir.', { d: '15 minutes', ref: REFS.POUXIT_XF, v: 'Durée à confirmer.' }),"],
  ['une reference mal nommee', `${ECRITES}/familles/soins.mjs`, "{ ref: REFS.EXCES_DE_PROTEINES }),\n      P('Locks propres avant le soin.'),", "{ ref: REFS.EXCES_DES_PROTEINES }),\n      P('Locks propres avant le soin.'),"],
  ['le bain detox dure plus que ne le dit le Laboratoire', `${ECRITES}/familles/soins.mjs`, "{ d: '10 à 15 minutes, jamais plus' }", "{ d: '30 minutes' }"],
  ['une prestation offerte devient payante', `${ECRITES}/prestations-offertes.mjs`, "    priceXof: 0,\n    hidePrice: false,\n    priceMode: 'fixe',\n    sessions: 1,\n    master: 'Team',\n    durationMin: 20,", "    priceXof: 5000,\n    hidePrice: false,\n    priceMode: 'fixe',\n    sessions: 1,\n    master: 'Team',\n    durationMin: 20,"],
];

const source = lis(SOURCE).replace(/\r\n/g, '\n');
let code = 0;
try {
  const echecs = epreuves(await chargeLePur(source), await chargeLesEcrites(path.join(racine, ECRITES)), true);
  console.log(echecs.length === 0 ? '\nTOUT TIENT : les fiches de procedure.' : `\n${echecs.length} ECHEC(S).`);
  if (echecs.length > 0) code = 1;

  if (code === 0 && process.argv.includes('--prouve')) {
    console.log('\n-- La preuve : chaque panne, dans une copie, doit faire crier le banc --');
    const pur = await chargeLePur(source);
    const ecrites = await chargeLesEcrites(path.join(racine, ECRITES));
    let muettes = 0;
    let n = 0;
    for (const [nom, fichier, de, vers] of PANNES) {
      n += 1;
      let crie = [];
      if (fichier === SOURCE) {
        if (!source.includes(de)) { console.log(`PANNE INTROUVABLE  ${nom}`); muettes += 1; continue; }
        crie = epreuves(await chargeLePur(source.replace(de, () => vers)), ecrites, false);
      } else {
        const copie = path.join(d, `ecrites-${n}`);
        cpSync(path.join(racine, ECRITES), copie, { recursive: true });
        const rel = path.relative(ECRITES, fichier);
        const texte = readFileSync(path.join(copie, rel), 'utf8').replace(/\r\n/g, '\n');
        if (!texte.includes(de)) { console.log(`PANNE INTROUVABLE  ${nom}`); muettes += 1; continue; }
        writeFileSync(path.join(copie, rel), texte.replace(de, () => vers));
        /* Une famille qui refuse de se charger a crié elle-même (une référence inconnue, par exemple). */
        try { crie = epreuves(pur, await chargeLesEcrites(copie), false); } catch (err) { crie = [`chargement refuse : ${String(err.message).slice(0, 60)}`]; }
      }
      if (crie.length === 0) muettes += 1;
      console.log(`${crie.length > 0 ? 'CRIE  ' : 'MUETTE'} ${nom}${crie.length > 0 ? ` (${crie[0].split(' ')[0]}${crie.length > 1 ? ` et ${crie.length - 1} autre(s)` : ''})` : ''}`);
    }
    console.log(muettes === 0 ? `\nPREUVE FAITE : ${PANNES.length} pannes sur ${PANNES.length} font crier le banc.` : `\n${muettes} PANNE(S) MUETTE(S) OU INTROUVABLE(S).`);
    if (muettes > 0) code = 1;
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
process.exit(code);
