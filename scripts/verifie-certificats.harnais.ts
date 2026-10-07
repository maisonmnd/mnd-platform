/* LE COFFRE DES CERTIFICATS, ÉPROUVÉ — `node scripts/verifie-certificats.mjs`.

   Le chemin d'un certificat au coffre et le nom de son fichier se déduisent
   du numéro et du nom de l'apprenant : un numéro vide, un nom accentué, un
   identifiant douteux ne doivent jamais donner un chemin qui casse, ni deux
   fichiers pour un seul papier. */
import {
  numeroPropre, nomPropre, dossierPropre, nomDuFichierCertificat, cheminDuCertificat, copiesTriees,
} from '../src/shared/certificats-coffre';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LE NUMÉRO ET LE NOM, PROPRES ─────────────────────────────── */
dit('un numéro de la Maison reste tel quel', 'MND-AC-2026-0001', numeroPropre('MND-AC-2026-0001'));
dit('un numéro vide se dit', 'sans-numero', numeroPropre('   '));
dit('un numéro fantaisiste se borne', 'n-12-b', numeroPropre(' n° 12 / b '));
dit('le nom perd ses accents et ses espaces', 'Vioutou-Raimath-Bonou', nomPropre('Vioutou Raïmath Bonou'));
dit('un nom vide se dit', 'apprenant', nomPropre(''));
dit('un identifiant d’inscription garde lettres, chiffres, tirets', 'abc-123_x', dossierPropre(' abc-123_x/../'));

/* ── ② LE FICHIER ET LE CHEMIN ──────────────────────────────────── */
dit('le fichier téléchargé porte le nom puis le numéro',
  'Certificat-MND-Vioutou-Raimath-Bonou-MND-AC-2026-0001.pdf', nomDuFichierCertificat('Vioutou Raïmath Bonou', 'MND-AC-2026-0001'));
dit('le chemin au coffre : un dossier par inscription, un fichier par numéro',
  'ins-42/MND-AC-2026-0001.pdf', cheminDuCertificat('ins-42', 'MND-AC-2026-0001'));
dit('le même numéro donne le même chemin : la copie se remplace, elle ne se double pas',
  true, cheminDuCertificat('ins-42', 'MND-AC-2026-0001') === cheminDuCertificat('ins-42', ' MND-AC-2026-0001 '));

/* ── ③ CE QUE LE COFFRE RANGE ───────────────────────────────────── */
const listing = [
  { name: 'MND-AC-2026-0001.pdf', updated_at: '2026-09-16T10:00:00Z', metadata: { size: 300 } },
  { name: 'MND-AC-2026-0002.pdf', updated_at: '2026-09-16T12:00:00Z', metadata: { size: 400 } },
  { name: 'brouillon.txt', updated_at: '2026-09-16T13:00:00Z', metadata: { size: 10 } },
  { name: 'sous-dossier', updated_at: null, created_at: null, metadata: null },
];
const copies = copiesTriees('ins-42', listing);
dit('seuls les PDF comptent, la plus récente d’abord',
  ['ins-42/MND-AC-2026-0002.pdf', 'ins-42/MND-AC-2026-0001.pdf'], copies.map((c) => c.chemin));
dit('chaque copie dit quand elle a été déposée', '2026-09-16T12:00:00Z', copies[0].deposeLe);
dit('un coffre vide ne rend rien', [], copiesTriees('ins-42', []));

/* ══ LE CERTIFICAT EST CELUI DE L'ACADÉMIE MND — 7 octobre 2026 ══════
   Maquette DagAWw1Wfb2S1rt2pYc4pW validée. Ce qui ne doit jamais revenir
   en silence : la Maison sur le certificat (nom, monogramme, devise, sceau
   rond), l'ordre « MND Académie » (la charte dit « Académie MND »), un
   écran et un PDF qui ne posent pas les mêmes images. */
{
  const { readFileSync, existsSync } = await import('node:fs');
  /* « image/* » (le sélecteur de photo) ressemble à un début de commentaire :
     on le retire avant d'effacer les commentaires (leçon du 6 octobre). */
  const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/image\/\*/g, 'image').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const ecran = sansCommentaires('src/apps/certificat/App.tsx');
  const pdf = readFileSync('src/shared/pdf.ts', 'utf8');
  const debut = pdf.indexOf('export async function certificatEnPiece');
  const leCertificatPdf = pdf.slice(debut, pdf.indexOf('\n}\n', debut)).replace(/\/\*[\s\S]*?\*\//g, '');

  dit('l ecran ne nomme plus la Maison (hors reprise des anciens reglages)', false,
    /Maison MND/.test(ecran.replace("s.role.replace(/Maison MND/g, 'Académie MND')", '')));
  dit('l ecran ne pose ni la devise de la Maison ni son monogramme', [false, false], [/DEVISE_COMPLETE/.test(ecran), /monograms\/mono-/.test(ecran)]);
  dit('l ecran pose le verrou, le filigrane et le sceau de l Academie', [true, true, true], [
    ecran.includes("asset('/assets/academie/verrou-couche.png')"),
    ecran.includes("asset('/assets/academie/pictogramme.png')"),
    ecran.includes("asset('/assets/tampons/academie-dentele.png')"),
  ]);
  dit('« Certificat » seul, sans « Certification » au-dessus', false, /ct-kicker/.test(ecran));
  dit('la signature de l Academie au pied', true, ecran.includes('<div className="ct-signature-academie">{SIGNATURE_ACADEMIE}</div>'));
  dit('le PDF ne pose plus rien de la Maison', [false, false, false, false], [
    /MAISON MND/.test(leCertificatPdf), /tamponDeLaMaison\(/.test(leCertificatPdf), /pieDeLaMaison\(/.test(leCertificatPdf), /chargeMono\(/.test(leCertificatPdf),
  ]);
  dit('le PDF pose les memes images que l ecran', [true, true, true], [
    /chargeImageDuSite\(PICTO_ACADEMIE\.chemin\)/.test(leCertificatPdf),
    /chargeImageDuSite\(VERROU_ACADEMIE\.chemin\)/.test(leCertificatPdf),
    /chargeImageDuSite\(SCEAU_ACADEMIE\)/.test(leCertificatPdf),
  ]);
  dit('les chemins du PDF sont ceux de l ecran', [true, true, true], [
    pdf.includes("chemin: '/assets/academie/verrou-couche.png'"), pdf.includes("chemin: '/assets/academie/pictogramme.png'"),
    pdf.includes("const SCEAU_ACADEMIE = '/assets/tampons/academie-dentele.png';"),
  ]);
  dit('le verrou du PDF au-dessus du plancher (33 mm) : 210 px de feuille', true, /addImage\(verrou, 'PNG', CX - px\(105\), px\(y\), px\(210\)/.test(leCertificatPdf) && 210 * 297 / 1120 >= 33);
  dit('les images existent dans le site', [true, true, true], [
    existsSync('public/assets/academie/verrou-couche.png'), existsSync('public/assets/academie/pictogramme.png'), existsSync('public/assets/tampons/academie-dentele.png'),
  ]);
  dit('le Secretariat propose le sceau de l Academie', true, readFileSync('src/shared/secretariat-tampons.ts', 'utf8').includes("{ cle: 'academie-dentele', nom: 'Le sceau dentelé de l’Académie MND', fichier: 'academie-dentele.png', ratio: 1 }"));
  dit('le bilan de formation est aux couleurs de l Academie', [true, true], [
    sansCommentaires('src/apps/trone/routes/equipe/AcademieSuivi.tsx').includes('academie: true'),
    /if \(o\.academie\) \{[\s\S]{0,200}SIGNATURE_ACADEMIE_PDF[\s\S]{0,60}\} else \{\s*await pieDeLaMaison/.test(pdf),
  ]);
  /* L'ORDRE DU NOM, partout où il se lit (hors commentaires) : le mot de
     vocation d'abord, puis MND. */
  const lus = ['src/apps/certificat/App.tsx', 'src/apps/academie/App.tsx', 'certificat.html', 'academie.html',
    'src/apps/trone/routes/clients/QrCodes.tsx', 'src/apps/trone/routes/vente/Caisse.tsx', 'src/apps/trone/routes/vente/Catalogue.tsx',
    'src/shared/catalog.ts', 'src/apps/trone/routes/equipe/Academie.tsx', 'src/apps/trone/routes/equipe/AcademieSuivi.tsx', 'src/shared/pdf.ts']
    .map((f) => sansCommentaires(f).replace(/<!--[\s\S]*?-->/g, ''));
  dit('« Academie MND », jamais « MND Academie »', false, lus.some((t) => /MND Acad[ée]mie|MND ACAD[ÉE]MIE/.test(t)));
}

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
