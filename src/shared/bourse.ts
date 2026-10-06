import {
  ecris, entreprises, metsAJour, nouvellePiece, pieces, resous, secretariatStore, signatairesDe, versLePdf, majEntreprise, creeEntreprise,
} from './secretariat';
import { rangeDansLeCadre, type DossierBourse, type Entreprise, type LigneSecretariat, type Piece } from './secretariat-pur';
import {
  documentsDeLaCampagne, lignesDuBordereau, lis, reponsesAuFormulaire, sansPreposition, signeThomas, moisDesReleves, type Campagne, type Membres, type Valeurs,
} from './bourse-pur';
import { octetsDUnePage } from './papiers';
import { texteDeLaMarque, titreDuPapier, type Papier } from './papiers-pur';

/* LE DOSSIER DE BOURSE, CÔTÉ TRÔNE — 7 octobre 2026.

   Une ligne `bourse` dans la table du Secrétariat : personnelle et privée,
   donc lue de la direction seule (0116, 0122). Les six documents signés de
   l'année (lettre, attestation NYM SARL, attestation d'hébergement, trois
   quittances) sont de VRAIS documents du Secrétariat, préparés en
   brouillon et marqués privés : ils profitent de l'éditeur, des signatures,
   du cachet, de la numérotation et du PDF. Les reprendre ne touche jamais
   un document déjà en signature ou signé. */

export const ID_DU_DOSSIER = 'bourse-famille';
export const NOM_THOMAS = 'M. Thomas BOYA';

export const leDossier = (l: readonly LigneSecretariat[]): DossierBourse | undefined =>
  l.find((x): x is DossierBourse => x.genre === 'bourse' && x.id === ID_DU_DOSSIER);

export function enregistreLeDossier(o: { branchId: string; valeurs: Valeurs; membres: Membres }): DossierBourse {
  const d: DossierBourse = {
    id: ID_DU_DOSSIER, genre: 'bourse', branchId: o.branchId, entite: 'perso', prive: true,
    valeurs: o.valeurs, membres: o.membres, majLe: new Date().toISOString(),
  };
  ecris(d);
  return d;
}

export const entrepriseNomee = (l: readonly LigneSecretariat[], nom: string): Entreprise | undefined =>
  entreprises(l).find((e) => e.nom.trim().toUpperCase() === nom.toUpperCase());

/** La clé d'un document d'une campagne : `bourse:2027-2028:04`. */
export const cleDuDocument = (c: Campagne, n: string): string => `bourse:${c.cle}:${n}`;

export const documentsDuDossier = (l: readonly LigneSecretariat[], c: Campagne): Piece[] =>
  pieces(l).filter((p) => p.dossier?.startsWith(`bourse:${c.cle}:`) && p.etat !== 'annule');

export type Preparation = { crees: number; repris: number; laisses: number; erreur?: string };

/** PRÉPARER (ou reprendre) les six documents de la campagne. */
export function prepareLesDocuments(o: { branchId: string; moi: string; c: Campagne; v: Valeurs }): Preparation {
  const lignes = secretariatStore.get();
  const nym = entrepriseNomee(lignes, 'NYM SARL');
  if (!nym) return { crees: 0, repris: 0, laisses: 0, erreur: 'NYM SARL n’existe pas encore au Secrétariat.' };

  /* M. Thomas BOYA : un particulier, gardé comme une « entreprise » sans
     tampon, privée. Sa signature se dépose dans sa fiche (P/O ou la sienne). */
  let thomas = entrepriseNomee(lignes, NOM_THOMAS);
  const mentionsThomas = [sansPreposition((o.v.thomasAdresse ?? '').trim()), 'Cotonou, Bénin'].filter(Boolean).join(' · ');
  const telThomas = (o.v.thomasTel ?? '').trim();
  if (!thomas) {
    thomas = creeEntreprise({ branchId: o.branchId, nom: NOM_THOMAS, mentions: mentionsThomas, telephone: telThomas, signataire: signeThomas(o.v) });
    majEntreprise(thomas, { prive: true });
    thomas = { ...thomas, prive: true };
  } else if (thomas.signataire !== signeThomas(o.v) || (telThomas && thomas.telephone !== telThomas) || (o.v.thomasAdresse && thomas.mentions !== mentionsThomas) || !thomas.prive) {
    majEntreprise(thomas, { signataire: signeThomas(o.v), telephone: telThomas || thomas.telephone, mentions: o.v.thomasAdresse ? mentionsThomas : thomas.mentions, prive: true });
  }

  /* Les signataires des parents : leurs fiches du Secrétariat, si elles existent. */
  const fiches = signatairesDe(lignes);
  const fiche = (mot: string) => fiches.find((f) => f.nom.toLowerCase().includes(mot));
  const parents = [fiche('yéman') ?? fiche('yeman'), fiche('brice')].filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ userId: f.userId, nom: f.nom, qualite: f.qualite }));

  const nomNym = nym.signataire?.trim() || '[nom du mandataire]';
  const existants = documentsDuDossier(lignes, o.c);
  const r: Preparation = { crees: 0, repris: 0, laisses: 0 };
  for (const doc of documentsDeLaCampagne(o.v, o.c, nomNym.replace(/,.*$/, ''))) {
    const cle = cleDuDocument(o.c, doc.cle);
    const deja = existants.find((p) => p.dossier === cle);
    if (deja && deja.etat !== 'brouillon') { r.laisses++; continue; }
    const entite = doc.qui === 'parents' ? 'perso' as const : 'autre' as const;
    const entreprise = doc.qui === 'nym' ? nym : doc.qui === 'thomas' ? thomas : undefined;
    const signataires = doc.qui === 'parents' ? (parents.length ? parents : [{ userId: o.moi, nom: lis(o.v, 'demandeur'), qualite: '' }])
      : [{ userId: 'entreprise', nom: entreprise!.signataire || entreprise!.nom, qualite: '' }];
    const tampon = doc.qui === 'nym' ? 'auto-cachet' : undefined;
    const patch: Partial<Piece> = {
      titre: doc.titre, objet: doc.objet, destinataire: doc.destinataire, appel: doc.appel, corps: doc.corps, cloture: doc.cloture,
      date: doc.date, lieu: 'Cotonou', signataires, tampon, prive: true, dossier: cle, aRelire: false, cadre: 'droite',
      poses: rangeDansLeCadre('droite', [...signataires.map((s) => `sig:${s.userId}`), ...(tampon ? ['tampon'] : [])]),
    };
    if (deja) { metsAJour(deja, patch); r.repris++; continue; }
    const p = nouvellePiece({ branchId: o.branchId, entite, entrepriseId: entreprise?.id, modele: 'libre', auteurId: o.moi, signataires });
    metsAJour(p, patch);
    r.crees++;
  }
  return r;
}

/* ══ LES PDF DU BORDEREAU ET DES RÉPONSES ════════════════════════════ */

/** Les polices standard du PDF ne portent que le latin occidental. */
const pourLePdf = (s: string): string => s
  .replace(/[  ]/g, ' ').replace(/[‘’]/g, '’')
  .replace(/[^ -ÿ’“”•…Œœ€]/g, '');

type Ecrivain = {
  doc: import('pdf-lib').PDFDocument;
  page: import('pdf-lib').PDFPage;
  y: number;
};

async function nouveauPdf() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const gras = await doc.embedFont(StandardFonts.TimesRomanBold);
  const encre = rgb(0.12, 0.13, 0.25);
  const doux = rgb(0.36, 0.37, 0.48);
  const cuivre = rgb(0.66, 0.38, 0.18);
  const A4: [number, number] = [595.28, 841.89];
  const w: Ecrivain = { doc, page: doc.addPage(A4), y: 790 };
  const marge = 56;
  const largeur = A4[0] - 2 * marge;
  const coupe = (texte: string, font: typeof serif, taille: number, max: number): string[] => {
    const mots = pourLePdf(texte).split(/\s+/);
    const lignes: string[] = [];
    let l = '';
    for (const m of mots) {
      const essai = l ? `${l} ${m}` : m;
      if (font.widthOfTextAtSize(essai, taille) > max && l) { lignes.push(l); l = m; } else l = essai;
    }
    if (l) lignes.push(l);
    return lignes;
  };
  const place = (h: number) => { if (w.y - h < 60) { w.page = doc.addPage(A4); w.y = 790; } };
  const texte = (t: string, o: { taille?: number; font?: typeof serif; couleur?: typeof encre; x?: number; max?: number; interligne?: number } = {}) => {
    const taille = o.taille ?? 11;
    const font = o.font ?? serif;
    const lignes = coupe(t, font, taille, o.max ?? largeur);
    for (const l of lignes) {
      place(taille * (o.interligne ?? 1.35));
      w.page.drawText(l, { x: o.x ?? marge, y: w.y, size: taille, font, color: o.couleur ?? encre });
      w.y -= taille * (o.interligne ?? 1.35);
    }
  };
  return { doc, serif, gras, encre, doux, cuivre, w, marge, largeur, texte, coupe, place, A4 };
}

/** 01 · Le bordereau, l'index en tête du dossier. */
export async function bordereauPdf(v: Valeurs, c: Campagne): Promise<Uint8Array> {
  const k = await nouveauPdf();
  k.texte(`CAMPAGNE BOURSIÈRE ${c.cle} · ANNÉE DE RÉFÉRENCE ${c.reference}`, { taille: 9, font: k.gras, couleur: k.cuivre });
  k.w.y -= 4;
  k.texte('Bordereau du dossier de demande de bourses scolaires', { taille: 18, font: k.gras });
  k.w.y -= 2;
  k.texte(`Famille AHOUANSOU · BOYA, Cotonou. Trois enfants scolarisés à l’${lis(v, 'ecole')} pour l’année ${c.cle}. Ce bordereau ouvre le dossier déposé à la section consulaire : les pièces suivent dans cet ordre, numérotées.`, { taille: 11, couleur: k.doux });
  k.w.y -= 10;
  const cols = [k.marge, k.marge + 34, k.marge + 330];
  k.place(20);
  k.w.page.drawText('N°', { x: cols[0], y: k.w.y, size: 9, font: k.gras, color: k.doux });
  k.w.page.drawText('PIÈCE', { x: cols[1], y: k.w.y, size: 9, font: k.gras, color: k.doux });
  k.w.page.drawText('QUI LA FOURNIT', { x: cols[2], y: k.w.y, size: 9, font: k.gras, color: k.doux });
  k.w.y -= 16;
  for (const l of lignesDuBordereau(c)) {
    const lignes = k.coupe(l.piece, k.serif, 11, cols[2] - cols[1] - 12);
    k.place(lignes.length * 15 + 8);
    const y0 = k.w.y;
    k.w.page.drawText(l.n, { x: cols[0], y: y0, size: 11, font: k.gras, color: k.cuivre });
    lignes.forEach((t, i) => k.w.page.drawText(t, { x: cols[1], y: y0 - i * 15, size: 11, font: k.serif, color: k.encre }));
    k.w.page.drawText(pourLePdf(l.qui), { x: cols[2], y: y0, size: 11, font: k.serif, color: k.doux });
    k.w.y = y0 - lignes.length * 15 - 6;
    k.w.page.drawLine({ start: { x: k.marge, y: k.w.y + 10 }, end: { x: k.marge + k.largeur, y: k.w.y + 10 }, thickness: 0.4, color: k.doux, opacity: 0.4 });
  }
  return k.doc.save();
}

/** 02 · Les réponses au formulaire, rubrique par rubrique. */
export async function reponsesPdf(v: Valeurs, c: Campagne): Promise<Uint8Array> {
  const k = await nouveauPdf();
  k.texte('LE FORMULAIRE OFFICIEL, RUBRIQUE PAR RUBRIQUE', { taille: 9, font: k.gras, couleur: k.cuivre });
  k.w.y -= 4;
  k.texte(`Réponses au formulaire de demande de bourses scolaires · ${c.cle}`, { taille: 17, font: k.gras });
  k.texte('Ce qui est écrit se recopie tel quel. Ce qui est entre crochets reste à saisir dans le Trône. Les rubriques sans objet portent « néant ».', { taille: 10.5, couleur: k.doux });
  for (const bloc of reponsesAuFormulaire(v, c)) {
    k.w.y -= 10;
    k.texte(bloc.page.toUpperCase(), { taille: 9.5, font: k.gras, couleur: k.cuivre });
    for (const [q, r] of bloc.lignes) {
      const gauche = k.coupe(q, k.serif, 10, 170);
      const droite = k.coupe(r, k.gras, 10.5, k.largeur - 186);
      const h = Math.max(gauche.length, droite.length) * 13.5 + 5;
      k.place(h);
      const y0 = k.w.y;
      gauche.forEach((t, i) => k.w.page.drawText(t, { x: k.marge, y: y0 - i * 13.5, size: 10, font: k.serif, color: k.doux }));
      droite.forEach((t, i) => k.w.page.drawText(t, { x: k.marge + 186, y: y0 - i * 13.5, size: 10.5, font: k.gras, color: k.encre }));
      k.w.y = y0 - h;
    }
  }
  return k.doc.save();
}

/* ══ L'ASSEMBLAGE ════════════════════════════════════════════════════ */

export type Morceau =
  | { genre: 'pdf'; titre: string; octets: Uint8Array }
  | { genre: 'papier'; titre: string; papier: Papier; titulaireNom: string };

/** Les octets PDF d'un document du Secrétariat (signé ou non). */
export async function octetsDuDocument(p: Piece, nomMaison: string): Promise<Uint8Array> {
  const r = await resous(p, secretariatStore.get(), nomMaison);
  const mod = await import('./pdf');
  const f = await mod.pieceEcriteEnFichier(versLePdf(r));
  return new Uint8Array(await f.arrayBuffer());
}

/** UN PDF, dans l'ordre du bordereau. Les copies de papiers portent la
    marque (obligatoire pour une personne, règle du 6 octobre) ; les
    documents de la famille, non. */
export async function assembleLeDossierDeBourse(o: {
  morceaux: Morceau[]; jour: string; lisUnePage?: (chemin: string) => Promise<Uint8Array | null>;
}): Promise<{ octets: Uint8Array; manquants: string[] }> {
  const lire = o.lisUnePage ?? octetsDUnePage;
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fort = await doc.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const marque = pourLePdf(texteDeLaMarque('la section consulaire', o.jour, 'bourse scolaire'));
  const manquants: string[] = [];
  for (const m of o.morceaux) {
    if (m.genre === 'pdf') {
      const src = await PDFDocument.load(m.octets, { ignoreEncryption: true });
      (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
      continue;
    }
    const avant = doc.getPageCount();
    for (const page of m.papier.pages) {
      const octets = await lire(page.chemin);
      if (!octets) { manquants.push(`${titreDuPapier(m.papier)} · ${m.titulaireNom}`); continue; }
      if (page.type === 'application/pdf') {
        const src = await PDFDocument.load(octets, { ignoreEncryption: true });
        (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
      } else {
        const image = page.type === 'image/png' ? await doc.embedPng(octets) : await doc.embedJpg(octets);
        const p = doc.addPage(A4);
        const k = Math.min((A4[0] - 72) / image.width, (A4[1] - 72) / image.height);
        p.drawImage(image, { x: (A4[0] - image.width * k) / 2, y: (A4[1] - image.height * k) / 2, width: image.width * k, height: image.height * k });
      }
    }
    for (let i = avant; i < doc.getPageCount(); i++) {
      const p = doc.getPage(i);
      const { width, height } = p.getSize();
      const taille = Math.max(10, Math.min(16, width / 40));
      const l = fort.widthOfTextAtSize(marque, taille);
      for (let j = -2; j <= 2; j++) {
        p.drawText(marque, { x: width / 2 - (l / 2) * Math.cos(Math.PI / 6), y: height / 2 - (l / 2) * Math.sin(Math.PI / 6) + j * height / 5,
          size: taille, font: fort, color: rgb(0.56, 0.23, 0.15), opacity: 0.28, rotate: degrees(30) });
      }
    }
  }
  return { octets: await doc.save(), manquants };
}

/** Les papiers du classeur à joindre, dans l'ordre du bordereau. */
export function papiersAJoindre(pp: readonly Papier[], m: Membres, c: Campagne): { n: string; papier: Papier; qui: string }[] {
  const t = (id?: string) => (id ? `pers:${id}` : '');
  const un = (titulaire: string, type: string, filtre?: (p: Papier) => boolean) =>
    pp.filter((p) => p.titulaire === titulaire && p.type === type && (!filtre || filtre(p))).sort((a, b) => a.delivreLe.localeCompare(b.delivreLe));
  const dernier = (l: Papier[]) => (l.length ? [l[l.length - 1]] : []);
  const out: { n: string; papier: Papier; qui: string }[] = [];
  const pousse = (n: string, qui: string, l: Papier[]) => l.forEach((papier) => out.push({ n, papier, qui }));
  pousse('2', 'Yéman', dernier(un(t(m.yeman), 'formulaire-aefe', (p) => p.delivreLe >= `${c.reference}-10-01`)));
  pousse('3', 'Yéman', dernier(un(t(m.yeman), 'livret')));
  for (const [cle, nom] of [['yeman', 'Yéman'], ['brice', 'Brice'], ['e1', 'Enfant 1'], ['e2', 'Enfant 2'], ['e3', 'Enfant 3']] as const) {
    pousse('4', nom, dernier(un(t(m[cle]), 'passeport')));
  }
  pousse('5b', NOM_THOMAS, [...dernier(un(t(m.thomas), 'cni')), ...dernier(un(t(m.thomas), 'cip')), ...dernier(un(t(m.thomas), 'facture'))]);
  pousse('7', 'Brice', dernier(un(t(m.brice), 'activite')));
  pousse('8', 'Yéman', dernier(un(t(m.yeman), 'carte-grise')));
  pousse('9', 'Yéman', dernier(un(t(m.yeman), 'plan-acces')));
  pousse('10', 'Yéman', un(t(m.yeman), 'bulletin', (p) => p.delivreLe.startsWith(`${c.reference}-`)));
  pousse('11', 'Yéman', dernier(un(t(m.yeman), 'avis-impot')));
  const moisReleves = moisDesReleves(c.depot);
  pousse('12', 'Yéman', un(t(m.yeman), 'releve', (p) => moisReleves.includes(p.delivreLe.slice(0, 7))));
  pousse('13', 'Yéman', dernier(un(t(m.yeman), 'cnss-pers')));
  return out;
}
