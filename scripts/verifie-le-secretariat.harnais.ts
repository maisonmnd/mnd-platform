/* LE SECRÉTARIAT — le harnais. 6 octobre 2026.

   Ce qu'il tient, et qui ne doit jamais casser en silence :
   1. UNE SÉRIE PAR NOM : MND-DOC, ACIA, une par entreprise, PERSO-xx ; un
      numéro d'une autre série ou d'une autre année ne nourrit jamais le
      compteur, même quand un préfixe en contient un autre.
   2. CHACUN SA SIGNATURE : on ne signe que si l'on est attendu, une fois ;
      le document passe « en signature » puis « signé » à la dernière.
   3. SIGNÉ, C'EST FIGÉ : plus rien ne se modifie ; annuler retire images,
      numéro et date.
   4. ACIA 1 NE PORTE RIEN DE MAISON MND : ni nom, ni verrou, ni devise,
      ni encre indigo de la Maison.
   5. LES FORMULES : « je » sur une lettre personnelle, « nous » sinon ;
      l'appel choisi se reprend dans la politesse.
   6. LA ZONE : signatures et tampon restent dedans, rangés ou glissés.
   7. LES MODÈLES : clés uniques, familles connues, formules valides, les
      modèles juridiques marqués « à faire relire », ni tiret long ni
      « salon ».
   8. LA BASE (0116) garde la porte : personnelles à la direction seule,
      signé figé, chacun sa signature, compartiment privé. (Éprouvée dans un
      vrai Postgres le 6 octobre, mutations comprises.)
   9. L'ÉCRAN ne montre pas les personnelles hors direction, ne pose que la
      signature de celui qui est connecté, et se range dans la barre. */
import { readFileSync } from 'node:fs';
import {
  ACIA, annulable, APPELS, borneDansLaZone, ifuPlausible, ligneDesMentions, supprimable, clotures, enTeteDe, modifiable, peutSigner, prefixeDeSerie, prochainNumero,
  nomsDansLaZone, rangeDansLeCadre, restentASigner, retireLesSignatures, sigle, signe, SIGNATURE_MM, TAMPON_MM, Y_DES_NOMS, ZONE, type Piece,
} from '../src/shared/secretariat-pur';
import { FAMILLES, MODELES } from '../src/shared/secretariat-modeles';
import { morceauxDuRecu, tamponAutoSvg } from '../src/shared/secretariat-tampons';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sansCommentairesSql = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

/* ── 1. UNE SÉRIE PAR NOM ──────────────────────────────────────────── */
const existants = ['MND-DOC-2026-011', 'MND-DOC-2026-002', 'ACIA-2026-050', 'MND-DOC-2025-099', 'MND-2026-007', undefined];
dit('la serie MND-DOC suit son propre compteur', 'MND-DOC-2026-012', prochainNumero('MND-DOC', 2026, existants));
dit('une entreprise dont le sigle est MND ne lit pas la serie MND-DOC', 'MND-2026-008', prochainNumero('MND', 2026, existants));
dit('une nouvelle annee repart a 001', 'MND-DOC-2027-001', prochainNumero('MND-DOC', 2027, existants));
dit('ACIA a sa serie', 'ACIA-2026-051', prochainNumero('ACIA', 2026, existants));
dit('un prefixe court ne lit pas la fin d un autre (NS dans ANS)', 'NS-2026-001', prochainNumero('NS', 2026, [...existants, 'ANS-2026-009']));
dit('les prefixes par entite', ['MND-DOC', 'ACIA', 'NS', 'PERSO-YB'], [
  prefixeDeSerie({ entite: 'mnd' }, {}), prefixeDeSerie({ entite: 'acia' }, {}),
  prefixeDeSerie({ entite: 'autre', entrepriseId: 'e' }, { entreprise: { nom: 'Nouvelle Société SARL' } }),
  prefixeDeSerie({ entite: 'perso' }, { auteurNom: 'Yéman Boya' }),
]);
dit('un sigle n est jamais vide', true, sigle('') .length >= 2 && sigle('SARL').length >= 2);

/* ── 2. CHACUN SA SIGNATURE ───────────────────────────────────────── */
const base: Piece = {
  id: 'doc-1', genre: 'piece', branchId: 'b', entite: 'mnd', auteurId: 'A', modele: 'libre', titre: 'Lettre',
  lieu: 'Cotonou', date: '2026-10-06', destinataire: 'Moov Africa', objet: 'Objet', appel: 'Madame, Monsieur,', corps: 'Texte.',
  cloture: '', signataires: [{ userId: 'A', nom: 'Yéman', qualite: 'Cogérante' }, { userId: 'B', nom: 'Brice', qualite: 'Cogérant' }],
  poses: rangeDansLeCadre('droite', ['sig:A', 'sig:B', 'tampon']), tampon: 'mnd-6-dentele', cadre: 'droite', etat: 'brouillon', creeLe: '2026-10-06T08:00:00Z',
};
const parC = signe(base, 'C', 'IMG-C', 't0');
dit('un compte non attendu ne signe pas', [base, false], [parC, peutSigner(base, 'C')]);
const parA = signe(base, 'A', 'IMG-A', 't1');
dit('la premiere signature met le document en signature', ['a-signer', ['B']], [parA.etat, restentASigner(parA).map((s) => s.userId)]);
dit('on ne signe pas deux fois', [false, parA], [peutSigner(parA, 'A'), signe(parA, 'A', 'IMG-A2', 't2')]);
const parAB = signe(parA, 'B', 'IMG-B', 't3');
dit('la derniere signature signe le document, chacun sa pose', ['signe', 't3', ['A', 'B']],
  [parAB.etat, parAB.signeLe, parAB.poses.filter((q) => q.image).map((q) => q.signePar)]);
dit('une signature ne prend que la cle de son compte', ['sig:A', 'sig:B'], parAB.poses.filter((q) => q.image).map((q) => q.cle));

/* ── 3. SIGNÉ, C'EST FIGÉ ─────────────────────────────────────────── */
dit('signe ou en signature : le texte ne se modifie plus', [true, false, false], [modifiable(base), modifiable(parA), modifiable(parAB)]);
dit('un document signe ne recoit plus de signature', false, peutSigner({ ...parAB, signataires: [...parAB.signataires, { userId: 'C', nom: 'C', qualite: '' }] }, 'C'));
const annule = retireLesSignatures({ ...parAB, numero: 'MND-DOC-2026-001' });
dit('annuler retire images, numero et date', ['brouillon', undefined, undefined, 0],
  [annule.etat, annule.numero, annule.signeLe, annule.poses.filter((q) => q.image || q.signePar).length]);

/* ── 4. ACIA 1 NE PORTE RIEN DE MAISON MND ────────────────────────── */
const acia = enTeteDe('acia', { nomMaison: 'Maison MND' });
const aciaTexte = JSON.stringify({ ...acia, lignes: acia.lignes.map((l) => l.replace(ACIA.courriel, '')) });
dit('ACIA 1 : ni nom de la Maison, ni verrou, ni devise, ni encre de la Maison', [false, false, false, false],
  [/Maison|MND/.test(aciaTexte), acia.verrou, acia.devise, acia.encre === enTeteDe('mnd', { nomMaison: 'Maison MND' }).encre]);
dit('ACIA 1 : RCCM et nom dans l en-tete', [true, 'ACIA 1'], [acia.lignes.join(' ').includes('RB/COT/12 A 14509'), acia.nom]);
dit('la Maison : verrou et devise', [true, true], [enTeteDe('mnd', { nomMaison: 'Maison MND' }).verrou, enTeteDe('mnd', { nomMaison: 'Maison MND' }).devise]);
const perso = enTeteDe('perso', { nomMaison: 'Maison MND', profil: { nom: 'Yéman', adresse: 'Fidjrossè, Cotonou, Bénin', telephone: '+229 01 00' } });
dit('une lettre personnelle n a ni pied d entreprise ni tampon possible', [[], false, 'Cotonou'], [perso.pied, /Maison|MND/.test(JSON.stringify(perso)), perso.ville]);
dit('une autre entreprise porte son telephone', true, enTeteDe('autre', { nomMaison: 'x', entreprise: { nom: 'NS SARL', mentions: 'Cotonou, Bénin', telephone: '+229 01 02' } }).lignes.join(' ').includes('Tél. +229 01 02'));

/* ── 5. LES FORMULES ──────────────────────────────────────────────── */
const je = clotures('Monsieur le Directeur,', 'perso');
const nous = clotures('Monsieur le Directeur,', 'mnd');
dit('perso parle en « je », jamais en « nous »', [false, true], [je.some((c) => /\bnous\b|\bnos\b|\bnotre\b/i.test(c)), je.some((c) => /\bje\b/i.test(c))]);
dit('l entreprise parle en « nous », jamais en « je »', [false, true], [nous.some((c) => /\bje\b|\bmes\b|\bma\b/i.test(c)), nous.some((c) => /\bnous\b/i.test(c))]);
dit('l appel choisi revient dans la politesse', true, nous[0].includes('Monsieur le Directeur'));
dit('« Bonjour » ne se repete pas dans la politesse', false, clotures('Bonjour,', 'mnd').some((c) => c.includes('Bonjour')));

/* ── 6. LA ZONE ───────────────────────────────────────────────────── */
const dedans = (p: { cle: string; x: number; y: number }) => {
  const w = p.cle === 'tampon' ? TAMPON_MM : SIGNATURE_MM.largeur;
  const h = p.cle === 'tampon' ? TAMPON_MM : SIGNATURE_MM.hauteur;
  return p.x >= 0 && p.y >= 0 && p.x + w <= ZONE.largeur && p.y + h <= ZONE.hauteur;
};
const cles = ['sig:A', 'sig:B', 'sig:C', 'tampon'];
dit('chaque cadre range tout dans la zone', [true, true, true],
  (['gauche', 'centre', 'droite'] as const).map((c) => rangeDansLeCadre(c, cles).every(dedans)));
const seCouvrent = (a: { x: number; l: number; y: number; h: number }, b: { x: number; l: number; y: number; h: number }) =>
  a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h;
const cadreDeDeux = (c: 'gauche' | 'centre' | 'droite') => {
  const poses = rangeDansLeCadre(c, ['sig:A', 'sig:B', 'tampon']);
  const sig = poses.filter((q) => q.cle.startsWith('sig:')).map((q) => ({ x: q.x, y: q.y, l: SIGNATURE_MM.largeur, h: SIGNATURE_MM.hauteur }));
  const t = poses.find((q) => q.cle === 'tampon')!;
  const tampon = { x: t.x, y: t.y, l: TAMPON_MM, h: TAMPON_MM };
  const places = nomsDansLaZone({ poses, cadre: c, signataires: base.signataires }, [{ nom: 'Yéman', qualite: 'Cogérante' }, { nom: 'Brice', qualite: 'Cogérant' }]);
  const noms = places.noms.map((n) => ({ x: n.x, y: Y_DES_NOMS - 4, l: 40, h: 9 }));
  return [!seCouvrent(sig[0], sig[1]), noms.every((n) => !seCouvrent(n, tampon)), places.colonnes && places.noms[0].x !== places.noms[1].x];
};
dit('deux signataires : signatures cote a cote, tampon jamais sur un nom, un nom sous chaque signature',
  [[true, true, true], [true, true, true], [true, true, true]], (['gauche', 'centre', 'droite'] as const).map(cadreDeDeux));
dit('un seul signataire : le nom sous le cadre choisi', [false, 94], (() => { const n = nomsDansLaZone({ poses: rangeDansLeCadre('droite', ['sig:A']), cadre: 'droite', signataires: [base.signataires[0]] }, [{ nom: 'Y', qualite: '' }]); return [n.colonnes, n.noms[0].x]; })());
dit('une pose glissee au-dela revient dans la zone', [{ cle: 'tampon', x: ZONE.largeur - TAMPON_MM, y: 0 }, true],
  [borneDansLaZone({ cle: 'tampon', x: 500, y: -9 }), dedans(borneDansLaZone({ cle: 'sig:A', x: -40, y: 300 }))]);

/* ── 7. LES MODÈLES ───────────────────────────────────────────────── */
const clesModeles = MODELES.map((m) => m.cle);
dit('les cles des modeles sont uniques', clesModeles.length, new Set(clesModeles).size);
dit('chaque modele est d une famille connue, chaque famille a un modele', [[], []], [
  MODELES.filter((m) => !FAMILLES.some((f) => f.cle === m.famille)).map((m) => m.cle),
  FAMILLES.filter((f) => !MODELES.some((m) => m.famille === f.cle)).map((f) => f.cle),
]);
dit('les formules des modeles existent', [], MODELES.filter((m) => m.appel >= APPELS.length || m.cloture >= clotures('x', 'mnd').length || m.appel < -1 || m.cloture < -1).map((m) => m.cle));
dit('contrats et juridiques sont « a faire relire »', [], MODELES.filter((m) => (m.famille === 'contrats' || m.famille === 'juridiques') && !m.aRelire).map((m) => m.cle));
const texteModeles = JSON.stringify(MODELES);
dit('ni tiret long ni « salon » dans les modeles', [false, false], [texteModeles.includes('—'), /\bsalon\b/i.test(texteModeles)]);
dit('les familles demandees le 6 octobre sont la', true,
  ['clients', 'fournisseurs', 'equipe', 'administration'].every((f) => MODELES.filter((m) => m.famille === f).length >= 3));

/* ── 8. LA BASE (0116) ────────────────────────────────────────────── */
const sql = sansCommentairesSql('supabase/migrations/0116_le_secretariat.sql');
const porte = "public.is_staff() and (coalesce(data->>'entite', '') <> 'perso' or public.est_direction())";
const politique = (nom: string) => sql.slice(sql.indexOf(`create policy ${nom}`), sql.indexOf(';', sql.indexOf(`create policy ${nom}`)));
dit('lire, ecrire, modifier : la personnelle a la direction seule', [true, true, true],
  ['secretariat_lire', 'secretariat_ecrire', 'secretariat_modifier'].map((n) => politique(n).includes(porte)));
dit('seule la direction efface', true, /for delete to authenticated\s+using \(public\.est_direction\(\)\)/.test(politique('secretariat_effacer')));
dit('la table est protegee', true, sql.includes('alter table public.secretariat enable row level security'));
dit('signe fige, sauf a l identique et pour la direction', true,
  /old\.data->>'etat' = 'signe'\s+and new\.data is distinct from old\.data and not public\.est_direction\(\)/.test(sql));
dit('chacun sa signature : cle et auteur du compte, a l insertion comme a la modification', [true, true, true], [
  sql.includes("pose->>'cle' = 'sig:' || moi and pose->>'signePar' = moi"),
  /before insert or update on public\.secretariat\s+for each row execute function public\.secretariat_garde_les_signatures/.test(sql),
  sql.includes('select s.data into avant from public.secretariat s where s.id = new.id'),
]);
dit('la signature d une entreprise : direction seule', true, sql.includes("(pose->>'cle' = 'sig:entreprise' and public.est_direction())"));
dit('le compartiment des signatures est prive, a chacun le sien', [true, 4], [
  sql.includes("values ('signatures', 'signatures', false"),
  (sql.match(/bucket_id = 'signatures' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) ?? []).length >= 4
    ? ['signatures_lire', 'signatures_deposer', 'signatures_remplacer', 'signatures_retirer'].filter((n) => politique(n).includes('(storage.foldername(name))[1] = auth.uid()::text')).length : 0,
]);

/* ── 9. L'ÉCRAN ───────────────────────────────────────────────────── */
const page = sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx');
dit('le registre cache les personnelles hors direction', true, page.includes("filter((p) => direction || p.entite !== 'perso')"));
dit('« Personnelle » ne se propose qu a la direction', true, page.includes("{ v: 'perso', l: 'Personnelle', si: direction }"));
const editeur = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Editeur.tsx');
const signeMoi = editeur.slice(editeur.indexOf('const signeMoi = async'), editeur.indexOf('const signePourLEntreprise'));
dit('signer pose la signature du compte connecte, et elle seule', [true, true, 1], [
  signeMoi.includes('chargeMaSignature(moi)'), signeMoi.includes('signeLaPiece(p, moi, image)'), (signeMoi.match(/signeLaPiece\(/g) ?? []).length,
]);
dit('rien ne se signe tant qu il reste [a completer] : signer, signer pour l entreprise, finaliser', 3, (editeur.match(/if \(reste > 0\) \{ toast/g) ?? []).length);
dit('signer pour une entreprise : direction seule', true, editeur.includes("p.entite === 'autre' && direction && peutSigner(p, 'entreprise')"));
dit('on ne glisse que sur un brouillon', true, editeur.includes('glissable={ouvert}') && editeur.includes('if (ouvert) maj({ poses'));
const signatures = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Signatures.tsx');
dit('le pave de signature ne vit jamais dans un Field (une etiquette qui annule les clics)', false, /<Field[^>]*>\s*(\{[^}]*\?[^:]*:\s*)?<PaveDeSignature/.test(signatures));
dit('« Importer une photo » est un vrai bouton qui ouvre le fichier, et se rechoisit', [true, false, true], [
  /<Button[^>]*onClick=\{\(\) => fichier\.current\?\.click\(\)\}>Importer une photo<\/Button>/.test(signatures),
  /<label[^>]*>\s*Importer une photo/.test(signatures),
  readFileSync('src/apps/trone/routes/pilotage/secretariat/Signatures.tsx', 'utf8').includes("e.target.value = ''"), // brut : « image/* » ressemble à un commentaire
]);
const effetDuPave = signatures.slice(signatures.indexOf('useEffect(() => {'), signatures.indexOf('}, [valeur]);'));
dit('le pave ne s efface pas sous le doigt : on sort AVANT de vider quand on dessine', true,
  effetDuPave.indexOf('if (aDessine.current) return;') > -1 && effetDuPave.indexOf('if (aDessine.current) return;') < effetDuPave.indexOf('clearRect'));
const nettoyage = sansCommentaires('src/shared/secretariat.ts').slice(sansCommentaires('src/shared/secretariat.ts').indexOf('export function nettoieLaSignature'));
dit('une image deja transparente se pose sur du blanc avant d etre lue', true,
  /ctx\.fillStyle = '#FFFFFF';\s*ctx\.fillRect\(0, 0, w, h\);\s*ctx\.drawImage\(src, 0, 0, w, h\);/.test(nettoyage));
dit('lire sa signature a une limite de temps', true, /Promise\.race\(\[lecture, delai\]\)/.test(sansCommentaires('src/shared/secretariat.ts')));
const routes = sansCommentaires('src/apps/trone/routes/index.tsx');
dit('l ecran est dans la barre (Direction) et nomme parmi les ecrans nes apres', [true, true], [
  /group: 'Direction',[\s\S]*?path: '\/secretariat'[\s\S]*?group: 'Clientèle'/.test(routes),
  /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/secretariat'/.test(routes),
]);
dit('la remise a zero de la Maison vide la table', true, /'secretariat',\s*\n\];/.test(sansCommentaires('src/apps/trone/houseReset.ts')));
dit('« Recu le » : jour, mois, annee sur deux chiffres ; rien hors du siecle imprime', [['06', '10', '26'], null, null],
  [morceauxDuRecu('2026-10-06'), morceauxDuRecu('1999-12-31'), morceauxDuRecu('')]);
const resolution = sansCommentaires('src/shared/secretariat.ts');
dit('« Recu le » porte la date choisie, sinon celle du document', true,
  /p\.tampon === TAMPON_A_DATER\)[\s\S]{0,120}const quand = p\.dateTampon \|\| p\.date;[\s\S]{0,120}dateSurLeRecu\(brut, quand\)/.test(resolution));
dit('l editeur propose la date du tampon quand c est « Recu le »', true, editeur.includes('{p.tampon === TAMPON_A_DATER && ('));
dit('le tampon d une entreprise echappe son nom', false, /<script|<img/i.test(tamponAutoSvg('<script>x</script>', '', '') + tamponAutoSvg('ok', '', '<img onerror=x>')));

/* ── 10. SUPPRIMER, ANNULER — 6 octobre 2026 (« brouillons seulement ») ── */
dit('on supprime un brouillon, rien d autre', [true, false, false, false],
  (['brouillon', 'a-signer', 'signe', 'annule'] as const).map((etat) => supprimable({ etat })));
dit('on annule un document signe, rien d autre', [false, false, true, false],
  (['brouillon', 'a-signer', 'signe', 'annule'] as const).map((etat) => annulable({ etat })));
const magasin = sansCommentaires('src/shared/secretariat.ts');
dit('effacer refuse tout ce qui n est pas un brouillon', true,
  /export function effaceLaPiece\(p: Piece\): boolean \{\s*if \(!supprimable\(p\)\) return false;/.test(magasin));
dit('annuler garde la piece au registre (etat annule, numero garde)', true,
  /const suite: Piece = \{ \.\.\.p, etat: 'annule', annuleLe: maintenant\(\) \};/.test(magasin));
dit('le registre ne propose Supprimer qu a la direction, et sur un brouillon', true, page.includes('{direction && supprimable(p) && ('));

/* ── 11. L'IFU, TAPÉ PAR LA DIRECTION — 6 octobre 2026 ── */
dit('la ligne des mentions ne dit que ce qui est donne', ['RCCM R · IFU 1', 'IFU 1', ''],
  [ligneDesMentions({ rccm: 'R', ifu: '1' }), ligneDesMentions({ rccm: ' ', ifu: '1' }), ligneDesMentions(undefined)]);
const mndAvecIfu = enTeteDe('mnd', { nomMaison: 'Maison MND', mentions: { rccm: '', ifu: '3202300000000' } });
dit('Maison MND : l IFU au pied, en seconde ligne ; rien sans IFU', [2, 'IFU 3202300000000', 1],
  [mndAvecIfu.pied.length, mndAvecIfu.pied[1], enTeteDe('mnd', { nomMaison: 'Maison MND' }).pied.length]);
const aciaAvecIfu = enTeteDe('acia', { nomMaison: 'Maison MND', mentions: { rccm: '', ifu: '1234567890123' } });
dit('ACIA 1 : son RCCM connu, l IFU ajoute, et toujours rien de Maison MND', ['RCCM RB/COT/12 A 14509 · IFU 1234567890123', false],
  [aciaAvecIfu.lignes[0], /Maison|MND/.test(JSON.stringify({ ...aciaAvecIfu, lignes: aciaAvecIfu.lignes.map((l) => l.replace(ACIA.courriel, '')) }))]);
dit('un IFU du Benin a treize chiffres', [true, true, false, false],
  [ifuPlausible('3202300000000'), ifuPlausible('3202 3000 00000'), ifuPlausible('12345'), ifuPlausible('')]);
dit('une piece signee fige ses mentions ; l apercu les relit avant celles du jour', [true, true], [
  /const mentionsFigees = m \? \{ rccm: m\.rccm, ifu: m\.ifu \} : undefined;/.test(magasin),
  /mentions: p\.mentionsFigees \?\? actuelles/.test(magasin),
]);
dit('le PDF descend la devise quand le pied a deux lignes', true,
  sansCommentaires('src/shared/pdf.ts').includes('pieDeLaMaison(doc, W, 283.5 + Math.max(1, d.enTete.pied.length) * 3.6 + 1.4'));
dit('seule la direction ouvre les mentions', true, page.includes('{mentions && direction && <MentionsDeLEnTete'));

console.log(ko === 0 ? '\nLe secretariat tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
