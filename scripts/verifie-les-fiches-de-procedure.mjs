import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES FICHES DE PROCEDURE, EPROUVEES - 25 novembre 2026.
   « Cree une fiche de procedure par soin du catalogue, en commencant par le
   Rituel SOWA. Utilise le meme format pour chaque fiche. Signale les
   informations a valider, sans inventer de dosage, de duree ou de
   contre-indication. Relie chaque fiche a la prestation correspondante et
   ajoute un bouton Voir le protocole dans le rendez-vous. L'equipe doit
   pouvoir consulter la version validee sans quitter le rendez-vous » (Yeman).

   Ce banc tient, contre le module pur et les ecrans eux-memes :
   · LE FORMAT : sept rubriques, toujours les memes, toujours dans cet ordre,
     pour la fiche Sowa comme pour la fiche de depart de n'importe quel soin ;
   · LA FICHE SOWA : reliee au Rituel Sowa du catalogue, la recommandation
     DANDAN, la Couronne Cocon offerte aux enfants, le controle offert a J+7,
     Pouxit seul tant que neem et shikakai ne sont pas valides ;
   · RIEN D'INVENTE : hors « J+7 », la fiche ne porte AUCUN chiffre (ni
     dosage, ni duree, ni age) ; le temps de pose, le rincage, la seconde
     application, l'age minimum et les contre-indications sont chacun
     signales « a valider » ;
   · LA VERSION VALIDEE : l'equipe ne lit jamais un brouillon ; une version
     validee est une copie figee, numerotee, signee ; le code ne signe jamais
     a la place de la direction (la semence nait en brouillon) ;
   · LE LIEN : par l'identifiant de la prestation, puis par son code sans
     longueur ; les prestations comprises dans un forfait suivent ;
   · LES BRANCHEMENTS : le bouton « Voir le protocole » dans la fenetre du
     rendez-vous, sa fenetre par-dessus (portail), le Catalogue, le magasin,
     la migration 0244 (la direction seule ecrit).

   `--prouve` plante des pannes dans une COPIE du module (dossier temporaire,
   aucun fichier du depot touche) et exige que chacune fasse crier le banc.
   Lance : node scripts/verifie-les-fiches-de-procedure.mjs [--prouve]
   Sortie ASCII : la console de Windows. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8');
const SOURCE = 'src/shared/fiches-de-procedure-pur.ts';
const d = mkdtempSync(path.join(tmpdir(), 'fiches-proc-'));

const MAGASIN = lis('src/shared/fiches-de-procedure.ts');
const LECTURE = lis('src/apps/trone/routes/vente/FicheDeProcedure.tsx');
const ATELIER = lis('src/apps/trone/routes/vente/FichesDeProcedure.tsx');
const RDV = lis('src/apps/trone/routes/clients/_shared.tsx');
const CATALOGUE = lis('src/apps/trone/routes/vente/Catalogue.tsx');
const SQL = lis('supabase/migrations/0244_les_fiches_de_procedure.sql');
const BESOINS = lis('src/shared/besoins-pur.ts');
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

let numero = 0;
async function charge(source) {
  numero += 1;
  const ts = path.join(d, `fiches-${numero}.ts`);
  const out = path.join(d, `fiches-${numero}.mjs`);
  writeFileSync(ts, source);
  await build({ entryPoints: [ts], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

/** Tous les mots d'un contenu : texte, detail et « a valider » de chaque ligne. */
const motsDe = (m, contenu) => m.IDS_DES_RUBRIQUES
  .flatMap((r) => (contenu[r] ?? []).flatMap((l) => [l.texte, l.detail ?? '', l.aValider ?? '']))
  .join('\n');

/** Les epreuves, sur un module. Rend la liste des echecs. */
function epreuves(m, parle) {
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
  const sowa = m.FICHE_SOWA;
  const S = sowa.brouillon;
  const signalees = (r) => S[r].filter((l) => !!l.aValider);
  const uneSignaleeDit = (r, motif) => signalees(r).some((l) => motif.test(`${l.texte} ${l.aValider}`));

  /* ── A. Le format ── */
  dit('A1 sept rubriques, dans l ordre demande', ORDRE, m.RUBRIQUES.map((r) => r.id));
  dit('A2 leurs titres', [
    'Objectif', 'Public', 'Produits et références', 'Vérifications à l’arrivée',
    'Étapes et temps de pose validés', 'Conseils après le soin', 'Inclusions et suivi',
  ], m.RUBRIQUES.map((r) => r.titre));
  dit('A3 la fiche Sowa porte les sept rubriques, aucune vide', [ORDRE, []], [Object.keys(S), m.rubriquesVides(S)]);
  dit('A4 un contenu abime revient complet, une rubrique inconnue est ecartee', ORDRE,
    Object.keys(m.contenuSur({ etapes: [{ texte: 'Une etape' }, null, 7], huitieme: [{ texte: 'x' }], objectif: 'pas une liste' })));
  dit('A5 une ligne vide ne se garde pas, une ligne signalee se garde', [1, 'Durée à écrire'],
    (() => { const c = m.contenuSur({ etapes: [{ texte: '  ' }, { texte: '', aValider: 'Durée à écrire' }] }); return [c.etapes.length, c.etapes[0]?.aValider]; })());
  dit('A6 seules deux rubriques portent une seconde case (reference, temps de pose)', ['produits', 'etapes'],
    m.RUBRIQUES.filter((r) => !!r.detail).map((r) => r.id));

  /* ── B. La fiche Sowa ── */
  const idDesBesoins = BESOINS.match(/sowa:\s*'([a-z0-9]+)'/)?.[1] ?? 'introuvable';
  dit('B1 reliee au Rituel Sowa du catalogue (le meme identifiant que les besoins)', [idDesBesoins, idDesBesoins], [m.ID_DU_RITUEL_SOWA, sowa.serviceId]);
  dit('B2 la recommandation DANDAN : aux etapes, aux conseils, aux inclusions', [true, true, true],
    ['etapes', 'conseils', 'suivi'].map((r) => S[r].some((l) => /DÀNDÀN™/.test(l.texte) && /recommand/i.test(l.texte))));
  dit('B3 la Couronne Cocon, offerte aux enfants', true,
    S.suivi.some((l) => /^Offert aux enfants/.test(l.texte) && /Couronne Cocon/.test(l.texte)) && S.etapes.some((l) => /enfant/.test(l.texte) && /Couronne Cocon/.test(l.texte)));
  dit('B4 le controle offert a J+7 : aux inclusions, aux etapes, aux conseils', [true, true, true],
    [S.suivi.some((l) => /^Offert/.test(l.texte) && /contrôle/.test(l.texte) && /J\+7/.test(l.texte)),
      S.etapes.some((l) => /contrôle/.test(l.texte) && /offert/.test(l.texte) && /J\+7/.test(l.texte)),
      S.conseils.some((l) => /contrôle/.test(l.texte) && /J\+7/.test(l.texte))]);
  dit('B5 Pouxit : la reference exacte reste a inscrire, tout le reste depend de la notice', true,
    S.produits.some((l) => /^Pouxit/.test(l.texte) && !l.detail && /référence exacte/.test(l.aValider ?? '') && /notice/.test(l.aValider ?? '')));
  dit('B6 neem et shikakai : a valider, hors de la seance, Pouxit seul', true,
    S.produits.some((l) => /neem/.test(l.texte) && /shikakaï/.test(l.texte) && /à valider/.test(l.aValider ?? '') && /enfants/.test(l.aValider ?? '')
      && /hors de la séance/.test(l.aValider ?? '') && /Pouxit seul/.test(l.aValider ?? ''))
    && S.etapes.some((l) => /Pouxit seul/.test(l.texte) && /ni neem ni shikakaï/.test(l.texte)));

  /* ── C. Rien d'invente ── */
  const mots = motsDe(m, S);
  dit('C1 hors « J+7 », la fiche Sowa ne porte aucun chiffre (ni dosage, ni duree, ni age)', [], mots.replace(/J\+7/g, '').match(/\d+/g) ?? []);
  dit('C2 aucune unite de dose ou de temps ecrite', [], mots.match(/\b(minutes?|min|heures?|ml|millilitres?|grammes?|cuill[eè]res?|gouttes?)\b/gi) ?? []);
  dit('C3 le temps de pose, le rincage et la seconde application ne disent que « selon la notice », et le signalent',
    [['Selon la notice du produit'], 3],
    [[...new Set(S.etapes.filter((l) => !!l.detail).map((l) => l.detail))], S.etapes.filter((l) => !!l.detail && !!l.aValider).length]);
  dit('C4 a valider : le dosage, le temps de pose, le rincage, la seconde application', [true, true, true, true],
    [/Dosage/, /Temps de pose/, /Rinçage/, /Seconde application/].map((x) => uneSignaleeDit('etapes', x)));
  dit('C5 a valider : l age minimum et les contre-indications, rien de suppose', [true, true],
    [uneSignaleeDit('public', /Âge minimum[\s\S]*Aucun âge n’a été supposé/), uneSignaleeDit('public', /Contre-indications[\s\S]*Rien n’a été supposé/)]);
  dit('C6 a valider : les conseils a la maison, la Couronne Cocon et le controle sans prestation au catalogue', [true, true, true],
    [uneSignaleeDit('conseils', /Aucun conseil n’a été supposé/), uneSignaleeDit('suivi', /Couronne Cocon[\s\S]*catalogue/), uneSignaleeDit('suivi', /contrôle[\s\S]*catalogue/)]);
  dit('C7 ni emoji ni tiret cadratin dans la fiche', [false, false], [EMOJI.test(mots + sowa.titre), /—/.test(mots + sowa.titre)]);
  dit('C8 chaque ligne a son identifiant, aucun en double', true,
    (() => { const ids = ORDRE.flatMap((r) => S[r].map((l) => l.id)); return ids.every(Boolean) && new Set(ids).size === ids.length; })());

  /* ── D. La version validee ── */
  dit('D1 la semence nait en brouillon : le code ne signe pas a la place de la direction', [undefined, 'brouillon'],
    [m.FICHES_DE_DEPART()[m.ID_DU_RITUEL_SOWA].validee, m.etatDeLaFiche(m.FICHES_DE_DEPART()[m.ID_DU_RITUEL_SOWA])]);
  dit('D2 l equipe ne lit pas un brouillon ; la direction, si', [null, 'brouillon'],
    [m.lectureDeLaFiche(sowa, false), m.lectureDeLaFiche(sowa, true)?.version]);
  const v1 = m.valideLaFiche(m.copieDeLaFiche(sowa), 'La Direction', '2026-11-25T10:00:00.000Z');
  dit('D3 valider : version 1, signee, datee', [1, 'La Direction', '2026-11-25T10:00:00.000Z'],
    'fiche' in v1 ? [v1.fiche.validee.numero, v1.fiche.validee.par, v1.fiche.validee.le] : [v1.refus]);
  const f1 = 'fiche' in v1 ? v1.fiche : m.copieDeLaFiche(sowa);
  dit('D4 l equipe lit alors la version validee, avec ses points signales', ['validee', m.pointsAValider(S).length],
    [m.lectureDeLaFiche(f1, false)?.version, m.pointsAValider(m.lectureDeLaFiche(f1, false)?.contenu ?? m.contenuVide()).length]);
  dit('D5 la fiche Sowa signale plus de dix points a valider', true, m.pointsAValider(S).length >= 10);
  /* La version validee est une COPIE : toucher au brouillon, meme en place, ne la change pas. */
  const avant = JSON.stringify(f1.validee?.contenu);
  if (f1.brouillon.etapes[0]) f1.brouillon.etapes[0].texte = 'Etape corrigee au brouillon';
  dit('D6 corriger le brouillon ne change pas ce que lit l equipe', [avant, 'validee-et-brouillon'],
    [JSON.stringify(m.lectureDeLaFiche(f1, false)?.contenu), m.etatDeLaFiche(f1)]);
  const v2 = m.valideLaFiche(f1, 'La Direction', '2026-11-26T10:00:00.000Z');
  dit('D7 valider de nouveau : version 2, le brouillon corrige', [2, 'Etape corrigee au brouillon', 'validee'],
    'fiche' in v2 ? [v2.fiche.validee.numero, v2.fiche.validee.contenu.etapes[0].texte, m.etatDeLaFiche(v2.fiche)] : [v2.refus]);
  dit('D8 sans nom, pas de validation', true, 'refus' in m.valideLaFiche(m.copieDeLaFiche(sowa), '  ', '2026-11-25T10:00:00.000Z'));
  dit('D9 sans etape, pas de validation', true,
    'refus' in m.valideLaFiche({ ...m.copieDeLaFiche(sowa), brouillon: { ...m.copieDuContenu(S), etapes: [] } }, 'La Direction', '2026-11-25T10:00:00.000Z'));
  dit('D10 la signature se dit', 'Version 1, validée le 25 nov. 2026 par La Direction',
    m.signatureDeLaVersion({ numero: 1, le: 'x', par: 'La Direction', contenu: m.contenuVide() }, () => '25 nov. 2026'));

  /* ── E. Le document ── */
  dit('E1 un document vide ou abime porte quand meme la fiche Sowa', [true, true, true],
    [null, [], { autre: 'pas une fiche' }].map((brut) => !!m.fichesSures(brut)[m.ID_DU_RITUEL_SOWA]));
  const corrigee = { ...m.copieDeLaFiche(sowa), titre: 'Titre corrige par la direction' };
  dit('E2 la fiche du document l emporte sur sa semence', 'Titre corrige par la direction',
    m.fichesSures({ [m.ID_DU_RITUEL_SOWA]: corrigee })[m.ID_DU_RITUEL_SOWA].titre);
  dit('E3 une version validee sans numero ni date n en est pas une', undefined,
    m.fichesSures({ x1: { titre: 'T', brouillon: {}, validee: { contenu: {} } } }).x1.validee);

  /* ── F. Le lien avec la prestation ── */
  const fiches = {
    [m.ID_DU_RITUEL_SOWA]: f1,
    'sv-a-c': { serviceId: 'sv-a-c', code: 'PLT·99', titre: 'Soin A', brouillon: m.contenuVide(), validee: { numero: 1, le: '2026-11-25T10:00:00.000Z', par: 'D', contenu: { ...m.contenuVide(), etapes: [{ id: 'e1', texte: 'Geste' }] } } },
    'sv-b': { serviceId: 'sv-b', titre: 'Soin B', brouillon: { ...m.contenuVide(), etapes: [{ id: 'e1', texte: 'Geste' }] } },
  };
  const catalogue = new Map([
    { id: m.ID_DU_RITUEL_SOWA, name: 'Rituel Sówà™' },
    { id: 'sv-a-c', name: 'Soin A · Court', code: 'PLT·99·C' },
    { id: 'sv-a-l', name: 'Soin A · Long ou haute densité', code: 'PLT·99·L' },
    { id: 'sv-b', name: 'Soin B' },
    { id: 'sv-b-bis', name: 'Soin B', code: 'PLT·77·C' },
    { id: 'sv-forfait', name: 'Le Forfait', includes: [{ serviceId: 'sv-a-l' }, { serviceId: m.ID_DU_RITUEL_SOWA, offert: true }, { serviceId: '' }] },
  ].map((s) => [s.id, s]));
  dit('F1 la fiche par l identifiant de la prestation', m.ID_DU_RITUEL_SOWA, m.ficheDeLaPrestation(fiches, catalogue.get(m.ID_DU_RITUEL_SOWA))?.serviceId);
  dit('F2 une soeur de longueur lit la meme fiche (code sans longueur)', 'sv-a-c', m.ficheDeLaPrestation(fiches, catalogue.get('sv-a-l'))?.serviceId);
  dit('F3 un nom qui ressemble ne relie pas', undefined, m.ficheDeLaPrestation(fiches, catalogue.get('sv-b-bis')));
  dit('F4 au rendez-vous, l equipe : les fiches validees seulement, dans l ordre', [m.ID_DU_RITUEL_SOWA, 'sv-a-c'],
    m.fichesDuRendezVous(['sv-b', m.ID_DU_RITUEL_SOWA, 'sv-a-l', 'sv-a-c'], catalogue, fiches, false).map((l) => l.fiche.serviceId));
  dit('F5 au rendez-vous, la direction lit aussi le brouillon', [['sv-b', 'brouillon'], [m.ID_DU_RITUEL_SOWA, 'validee']],
    m.fichesDuRendezVous(['sv-b', m.ID_DU_RITUEL_SOWA], catalogue, fiches, true).map((l) => [l.fiche.serviceId, l.version]));
  dit('F6 un forfait apporte les fiches de ce qu il comprend, une fois chacune', [['sv-a-c', 'Le Forfait'], [m.ID_DU_RITUEL_SOWA, 'Le Forfait']],
    m.fichesDuRendezVous(['sv-forfait'], catalogue, fiches, false).map((l) => [l.fiche.serviceId, l.viaLeForfait]));
  dit('F7 sans fiche a lire, rien : le bouton ne parait pas', [], m.fichesDuRendezVous(['sv-b', 'sv-inconnue'], catalogue, fiches, false));
  const luesEquipe = m.fichesDuRendezVous([m.ID_DU_RITUEL_SOWA], catalogue, fiches, false);
  dit('F8 le bouton dit le soin et ses points a valider', `Rituel Sówà™ · ${m.pointsAValider(S).length} points à valider`, m.ceQueDitLeBouton(luesEquipe));
  dit('F9 le bouton dit un brouillon a la direction', 'Soin B · brouillon, pas encore validé',
    m.ceQueDitLeBouton(m.fichesDuRendezVous(['sv-b'], catalogue, fiches, true)));

  /* ── G. La fiche de depart d'un soin, lue au catalogue ── */
  const soin = {
    id: 'sv-x-m', code: 'PLT·10·M', name: 'DÀNDÀN™ · L’hydratation · Mi-Long', durationMin: 60, sessions: 1,
    description: 'DÀNDÀN™ : l’hydratation.\nUn soin pensé pour nourrir vos locks en profondeur, à la vapeur.\n\nVous en retirez : des locks souples et nourries.\n\nÀ choisir quand : vos cheveux sont secs.',
    includes: [{ serviceId: 'sv-b', afterWeeks: 8, offert: true }],
  };
  const depart = m.ficheDepuisLeCatalogue(soin, (id) => catalogue.get(id)?.name);
  const D = depart.brouillon;
  dit('G1 meme format : sept rubriques, aucune vide', [ORDRE, []], [Object.keys(D), m.rubriquesVides(D)]);
  dit('G2 reliee a la prestation, par son identifiant et son code sans longueur', ['sv-x-m', 'PLT·10', 'DÀNDÀN™ · L’hydratation'], [depart.serviceId, depart.code, depart.titre]);
  dit('G3 l objectif et le public viennent du catalogue, signales a relire', ['Des locks souples et nourries.', 'Vos cheveux sont secs.', true],
    [D.objectif[0].texte, D.public[0].texte, /Repris du catalogue/.test(D.objectif[0].aValider) && /Repris du catalogue/.test(D.public[0].aValider)]);
  dit('G4 aucune etape ni temps de pose invente : tout est signale, aucune seconde case remplie', [true, 0],
    [D.etapes.every((l) => !!l.aValider), D.etapes.filter((l) => !!l.detail).length]);
  dit('G5 produits, conseils, verifications : a ecrire, rien de suppose', [true, true, true],
    [D.produits.every((l) => !!l.aValider), D.conseils.every((l) => !!l.aValider), D.arrivee.some((l) => /Rien n’a été supposé/.test(l.aValider ?? ''))]);
  dit('G6 ce que le soin comprend, dit tel que le catalogue l ecrit', ['Offert : Soin B, 8 semaines après.'], D.suivi.map((l) => l.texte));
  dit('G7 les seuls chiffres sont ceux du catalogue', ['8'], motsDe(m, D).match(/\d+/g) ?? []);
  dit('G8 jamais validee d office', [undefined, null], [depart.validee, m.lectureDeLaFiche(depart, false)]);
  const avecFiche = m.ficheDepuisLeCatalogue({ id: 'sv-y', name: 'Soin Y', fiche: { contreIndications: 'Cuir chevelu à vif\nGrossesse', actifs: 'Huile de ricin' }, consultationAvant: true, sansRemise: true });
  dit('G9 les contre-indications de la fiche technique se recopient mot pour mot, sans en ajouter',
    ['Une consultation précède ce soin : vérifier qu’elle a eu lieu.', 'Contre-indication (fiche technique du catalogue) : Cuir chevelu à vif', 'Contre-indication (fiche technique du catalogue) : Grossesse'],
    avecFiche.brouillon.arrivee.map((l) => l.texte));
  dit('G10 les actifs deviennent des produits dont la reference reste a inscrire', [['Huile de ricin'], true],
    [avecFiche.brouillon.produits.map((l) => l.texte), avecFiche.brouillon.produits.every((l) => /Référence exacte/.test(l.aValider ?? ''))]);
  dit('G11 un soin sans description : tout est a ecrire, rien d invente', [true, []],
    (() => { const v = m.ficheDepuisLeCatalogue({ id: 'sv-z', name: 'Soin Z' }).brouillon; return [ORDRE.every((r) => v[r].every((l) => !!l.aValider)), motsDe(m, v).match(/\d+/g) ?? []]; })());

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
  dit('H7 un seul document, sa cle ecrite en toutes lettres, lie au serveur', [true, true],
    [MAGASIN.includes("createStore<LesFiches>('mnd_fiches_de_procedure', FICHES_DE_DEPART())"), MAGASIN.includes('bindDocument(fichesDeProcedureStore, CLE_DES_FICHES_DE_PROCEDURE);')]);
  const regles = [...SQL.matchAll(/create policy (\w+) on public\.documents\s+as restrictive for (insert|update|delete) to anon, authenticated/g)].map((x) => x[2]);
  dit('H8 la base : trois regles restrictives, la direction seule ecrit le document', [['insert', 'update', 'delete'], 4],
    [regles, (SQL.replace(/--[^\n]*/g, '').match(/key <> 'mnd_fiches_de_procedure' or public\.est_direction\(\)/g) ?? []).length]);
  dit('H9 la base n ouvre pas le document au site (aucune regle de lecture ajoutee)', 0, (SQL.replace(/--[^\n]*/g, '').match(/for select/g) ?? []).length);

  return echecs;
}

const PANNES = [
  ['une duree de pose inventee', "{\n      id: 'sowa-et-3', texte: 'Temps de pose.', detail: SELON_LA_NOTICE,", "{\n      id: 'sowa-et-3', texte: 'Temps de pose.', detail: '15 minutes',"],
  ['un dosage invente', 'Dosage : aucun n’est écrit ici. Suivre la notice', 'Dosage : 50 ml par tête. Suivre la notice'],
  ['le temps de pose n est plus signale', "aValider: 'Durée à recopier de la notice du Pouxit utilisé. Aucune durée n’a été supposée.',", ''],
  ['les contre-indications ne sont plus signalees', "aValider: 'À recopier de la notice du produit, puis à valider par la direction. Rien n’a été supposé.',", ''],
  ['Pouxit sans reference a inscrire', "aValider: 'Inscrire la référence exacte utilisée au salon. L’âge minimum, le temps de pose, le rinçage et la seconde application dépendent de sa notice.',", ''],
  ['le neem entre dans la seance', ' Pouxit seul : ni neem ni shikakaï dans cette séance.', ''],
  ['la recommandation DANDAN oubliee aux etapes', "    { id: 'sowa-et-6', texte: 'Recommander le soin hydratant DÀNDÀN™ à la cliente.' },\n", ''],
  ['la Couronne Cocon n est plus offerte aux enfants', 'Offert aux enfants : la coiffure protectrice Couronne Cocon.', 'En option : la coiffure protectrice Couronne Cocon.'],
  ['le controle passe a J+10', 'Offert : la séance de contrôle, à J+7.', 'Offert : la séance de contrôle, à J+10.'],
  ['l equipe lit le brouillon', "return direction ? { fiche: f, contenu: f.brouillon, version: 'brouillon' } : null;", "return { fiche: f, contenu: f.brouillon, version: 'brouillon' };"],
  ['la version validee n est pas une copie', 'validee: { numero: (f.validee?.numero ?? 0) + 1, le, par: qui, contenu: copieDuContenu(contenu) },', 'validee: { numero: (f.validee?.numero ?? 0) + 1, le, par: qui, contenu },'],
  ['la semence nait deja validee', "  brouillon: CONTENU_SOWA,\n};", "  brouillon: CONTENU_SOWA,\n  validee: { numero: 1, le: '2026-11-25T00:00:00.000Z', par: 'Le code', contenu: CONTENU_SOWA },\n};"],
  ['une validation sans nom passe', "if (!qui) return { refus: 'La validation porte un nom : votre compte n’en a pas.' };", ''],
  ['deux rubriques echangees', "  { id: 'objectif', titre: 'Objectif', aide: 'Ce que le soin doit obtenir.' },\n  { id: 'public', titre: 'Public', aide: 'Pour qui, et dans quel cas.' },", "  { id: 'public', titre: 'Public', aide: 'Pour qui, et dans quel cas.' },\n  { id: 'objectif', titre: 'Objectif', aide: 'Ce que le soin doit obtenir.' },"],
  ['un nom qui ressemble relie une fiche', 'return Object.values(fiches).find((f) => !!f.code && f.code === nu);', 'return Object.values(fiches).find((f) => (!!f.code && f.code === nu) || f.titre === (sv as { name?: string }).name);'],
  ['la fiche de depart invente un temps de pose', "    ligne('Étapes du fauteuil, dans l’ordre, et temps de pose.', 'À écrire par la direction. Aucune durée n’a été supposée.'),", "    ligne('Étapes du fauteuil, dans l’ordre, et temps de pose.', undefined, '20 minutes'),"],
  ['la fiche de depart ne signale plus ce qu elle reprend', "const REPRIS = 'Repris du catalogue, écrit pour la cliente : à relire pour l’équipe.';", "const REPRIS = '';"],
];

const source = lis(SOURCE).replace(/\r\n/g, '\n');
let code = 0;
try {
  const echecs = epreuves(await charge(source), true);
  const total = echecs.length;
  console.log(total === 0 ? '\nTOUT TIENT : les fiches de procedure.' : `\n${total} ECHEC(S).`);
  if (total > 0) code = 1;

  if (code === 0 && process.argv.includes('--prouve')) {
    console.log('\n-- La preuve : chaque panne, dans une copie, doit faire crier le banc --');
    let muettes = 0;
    for (const [nom, de, vers] of PANNES) {
      if (!source.includes(de)) { console.log(`PANNE INTROUVABLE  ${nom}`); muettes += 1; continue; }
      const crie = epreuves(await charge(source.replace(de, () => vers)), false);
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
