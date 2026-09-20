/* LES LETTRES DU PRÊT — 18 septembre 2026.

   « Prépare la lettre de demande de prêt et la lettre d'engagement, avec
   l'espace réservé pour la carte d'identité et la signature » (Yéman).
   Maquette `public/maquette-les-lettres-du-pret.html`.

   REMPLIES DEPUIS LE FORMULAIRE DU PRÊT, avant même de l'enregistrer : la
   demande se signe avant que le prêt ne soit accordé. Ce que le Trône ne
   connaît pas (l'adresse, le numéro de la carte, le motif quand il manque)
   reste une ligne à remplir à la main, jamais une valeur inventée.

   UNE FENÊTRE, PAS UNE ADRESSE : bulletin.html reçoit ses montants par
   l'URL, qui reste dans l'historique du navigateur. Ici le nom, le salaire
   et la dette d'un membre ne quittent pas la page qui les écrit.

   LE PICTOGRAMME DE LA MAISON EN TÊTE — 18 septembre 2026. « Il manque le
   logo de MND sur la lettre. Le pictogramme » (Yéman). Celui du site, déjà
   recadré (240 × 198) : net à l'impression, dix kilo-octets. La fenêtre
   d'impression n'a pas d'adresse à elle, d'où une adresse ENTIÈRE. */

import { nombreEnLettres } from '../../../../shared/nombre-en-lettres';
import { maisonNom, maisonRaison, maisonVille } from '../../../../shared/identite';

export type DonneesDesLettres = {
  nom: string;
  fonction?: string;
  telephone?: string;
  /** Date d'entrée dans la Maison, ISO. */
  depuis?: string;
  montantXof: number;
  /** Le jour du prêt, ISO. */
  date: string;
  motif?: string;
  baseXof: number;
  partPct: number;
  mensXof: number;
  mois: number;
  /** Le premier bulletin, « AAAA-MM ». */
  premierMois: string;
  /** Le plafond de la Maison, en % du net ; absent tant qu'il n'est pas fixé. */
  plafondPct?: number;
  /** LE CALENDRIER DES RETENUES, bulletin par bulletin (19 septembre 2026) :
      « Inclure la date des retenues sur le bulletin sur la lettre
      d'engagement » (Yéman). Ce que le Trône projette au moment de la
      signature ; la dernière retenue ne prend que ce qui reste. */
  plan?: readonly { mois: string; retenueXof: number; resteApresXof: number }[];
  /** SA PIÈCE D'IDENTITÉ, celle de sa fiche (19 septembre 2026), redessinée
      en JPEG par `imageDuCoffre`. Absente : les cases recto et verso restent,
      à coller à la main. */
  identite?: { donnees: string; ratio: number };
};

const echappe = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const francs = (n: number): string => Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ');
const pct = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
/** « oct. 2026 » — court, parce qu'un calendrier de treize bulletins tient
    sur deux lignes, jamais sur six. */
const moisCourt = (mois: string): string => new Date(`${mois}-01T00:00:00`)
  .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });

/** L'ÉCHÉANCIER, BULLETIN PAR BULLETIN — 20 septembre 2026. « Je veux le
    montant des retenues avec le solde à chaque versement pour que ce soit
    bien précis » (Yéman). Deux colonnes côte à côte, pour que douze bulletins
    tiennent en sept lignes. Au-delà de quatorze, on montre les onze premiers
    et les deux derniers : mesuré, c'est ce que la page porte sans déborder
    une fois l'échéancier agrandi (20 septembre), et personne ne signe une
    liste qu'il ne lit pas. */
type LigneDEcheancier = { mois: string; retenueXof: number; resteApresXof: number };
const echeancierDesRetenues = (plan: readonly LigneDEcheancier[]): string => {
  if (plan.length === 0) return '';
  const MAX = 14;
  const lignes: (LigneDEcheancier | null)[] = plan.length <= MAX
    ? [...plan]
    : [...plan.slice(0, MAX - 3), null, ...plan.slice(-2)];  // 11 + … + 2
  const moitie = Math.ceil(lignes.length / 2);
  const gauche = lignes.slice(0, moitie);
  const droite = lignes.slice(moitie);
  const cellules = (l: LigneDEcheancier | null | undefined): string => {
    if (l === undefined) return '<td></td><td></td><td></td>';
    if (l === null) return '<td class="creux" colspan="3">…</td>';
    /* L'UNITÉ VIT DANS L'EN-TÊTE, PAS DANS CHAQUE CELLULE (20 septembre
       2026) : quatre colonnes de « F » en moins, c'est douze millimètres
       rendus à la carte d'identité, à côté. */
    return `<td>${echappe(moisCourt(l.mois))}</td><td class="v">${francs(l.retenueXof)}</td>`
      + `<td>${l.resteApresXof > 0 ? francs(l.resteApresXof) : 'soldé'}</td>`;
  };
  /* EN-TÊTES COURTS : plus larges que les chiffres, ils commandaient la
     largeur des colonnes. L'unité se dit une fois, dans le titre du bloc. */
  const tete = '<th>Bulletin</th><th>Retenue</th><th>Reste dû</th>';
  return `
    <div class="ech">
      <span class="etq">L'échéancier des retenues &middot; ${plan.length} bulletin${plan.length > 1 ? 's' : ''} &middot; en francs</span>
      <table>
        <tr>${tete}${droite.length ? `<td class="sep"></td>${tete}` : ''}</tr>
        ${gauche.map((l, i) => `<tr>${cellules(l)}${droite.length ? `<td class="sep"></td>${cellules(droite[i])}` : ''}</tr>`).join('')}
      </table>
    </div>`;
};

const jourLong = (iso: string): string => new Date(`${iso.slice(0, 10)}T00:00:00`)
  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const moisLong = (mois: string): string => new Date(`${mois}-01T00:00:00`)
  .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
/** « du mois d'octobre 2026 », « du mois de mars 2027 » : l'élision devant
    avril, août et octobre. */
const duMois = (mois: string): string => {
  const m = moisLong(mois);
  return `du mois ${/^[aeiouyâ]/i.test(m) ? 'd’' : 'de '}<span class="v">${m}</span>`;
};

/** « de la Maison MND », mais « de L'atelier MND » — 19 septembre 2026. Le
    nom de la Maison se règle dans Paramètres : la lettre ne peut pas coller
    « de la » devant sans regarder ce qu'elle nomme. */
export const deLaMaison = (nom: string): string => {
  const n = nom.trim();
  if (/^l['’]/i.test(n)) return `de ${n}`;
  if (/^les\s/i.test(n)) return `des ${n.slice(4)}`;
  if (/^le\s/i.test(n)) return `du ${n.slice(3)}`;
  if (/^la\s/i.test(n)) return `de ${n}`;
  return `de la ${n}`;
};

/** « la Maison MND », mais « L'atelier MND » tout court : un nom qui porte
    déjà son article n'en reçoit pas un second. */
export const avecArticle = (nom: string): string => {
  const n = nom.trim();
  return /^(l['’]|les?\s|la\s)/i.test(n) ? n : `la ${n}`;
};

/** Une valeur connue, ou une ligne à remplir à la main de la largeur dite. */
const champ = (v: string | undefined, largeurMm = 40): string => (v && v.trim()
  ? `<span class="v">${echappe(v.trim())}</span>`
  : `<span class="blanc" style="--l:${largeurMm}mm"></span>`);

const STYLE = `
  :root { --indigo:#1E2150; --cuivre:#B97A4A; --encre-d:#746F65; --filet:#D9CFBC; --brique:#96412E; --brique-f:#FBF0ED; }
  * { box-sizing:border-box; }
  body { margin:0; background:#F3EDE1; font-family:'Jost','Century Gothic','Helvetica Neue',system-ui,sans-serif; color:#1d1b18; }
  .barre { position:sticky; top:0; z-index:2; display:flex; gap:12px; flex-wrap:wrap; align-items:center; padding:12px 20px;
           background:rgba(243,237,225,.96); border-bottom:1px solid var(--filet); font-size:13px; }
  .barre b { font-family:'Cormorant Garamond',Georgia,serif; font-weight:500; font-size:19px; color:var(--indigo); }
  .barre .note { flex:1 1 320px; color:#2A2722; background:var(--brique-f); border-left:3px solid var(--brique); padding:7px 11px; line-height:1.5; }
  .barre button { font:inherit; cursor:pointer; padding:8px 18px; border-radius:999px; border:1px solid var(--cuivre); background:var(--cuivre); color:#fff; }
  .feuilles { padding:24px 12px 60px; display:grid; gap:24px; justify-items:center; overflow-x:auto; }
  .feuille { width:210mm; height:297mm; background:#fff; overflow:hidden; padding:13mm 16mm 10mm; box-shadow:0 14px 40px rgba(30,33,80,.10);
             font-size:10pt; line-height:1.5; display:flex; flex-direction:column; }
  .entete { display:flex; justify-content:space-between; align-items:flex-end; gap:10mm; border-bottom:.6pt solid var(--indigo); padding-bottom:3mm; margin-bottom:5mm; }
  .marque { display:flex; align-items:flex-end; gap:4mm; min-width:0; }
  .picto { display:block; height:11mm; width:auto; flex:none; }
  .maison { font-family:'Cormorant Garamond',Georgia,serif; font-size:17pt; color:var(--indigo); line-height:1.05; }
  .maison small, .reference, .etq, .objet small { font-family:'Jost',sans-serif; font-size:7.4pt; letter-spacing:.15em; text-transform:uppercase; color:var(--encre-d); }
  .maison small { display:block; margin-top:1.2mm; }
  .reference { text-align:right; line-height:1.5; }
  .coord { display:flex; justify-content:space-between; gap:10mm; margin-bottom:4mm; font-size:9.6pt; line-height:1.7; }
  .coord .a { text-align:right; }
  .etq { display:block; margin-bottom:1.4mm; }
  .objet { font-family:'Cormorant Garamond',Georgia,serif; font-weight:500; font-size:14.5pt; color:var(--indigo); margin:0 0 3.5mm; line-height:1.2; }
  .objet small { display:block; color:var(--cuivre); margin-bottom:1.2mm; }
  p { margin:0 0 2.4mm; text-align:justify; hyphens:auto; }
  ol { margin:0 0 2.4mm; padding-left:5.5mm; }
  li { margin-bottom:1.4mm; text-align:justify; hyphens:auto; padding-left:1mm; }
  b { font-weight:500; }
  .v { color:var(--indigo); font-weight:500; }
  .blanc { display:inline-block; min-width:var(--l,30mm); height:1.05em; border-bottom:.6pt dotted #6b6559; vertical-align:baseline; }
  /* UNE LIGNE ENTIÈRE À REMPLIR — 19 septembre 2026. Une longue case
     insécable en fin de phrase basculait à la ligne suivante, et la
     justification écartait alors les mots de celle d'avant. */
  .blanc--plein { display:block; width:100%; min-width:0; margin-top:1mm; }
  .nw { white-space:nowrap; }
  /* TOUT REMONTE — 20 septembre 2026, « remonte partout » (Yéman). La zone
     des signatures était plaquée en bas de page (marge haute automatique) et
     laissait un grand vide au milieu. Elle suit maintenant le texte ; le
     blanc, s'il en reste, va en bas, là où il ne se voit pas.
     JAMAIS D'ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent dans un gabarit,
     et un seul accent grave le referme. */
  .zone { margin-top:7mm; }
  .deux { display:grid; grid-template-columns:1fr 1fr; gap:6mm; }
  /* LES CADRES DE SIGNATURE, PLUS PETITS — 20 septembre 2026, « là où sont les
     signatures rends ça plus petit » (Yéman) : la place ainsi gagnée porte
     l'échéancier ET la carte sur la même page. */
  .bloc { border:.6pt solid var(--filet); border-radius:1.5mm; padding:2.8mm 3.8mm; min-height:25mm; display:flex; flex-direction:column; }
  .bloc .ligne { border-bottom:.6pt dotted #6b6559; height:5mm; }
  .bloc .pied { margin-top:auto; padding-top:1.4mm; font-size:7.6pt; color:var(--encre-d); }
  /* L'ÉCHÉANCIER ET LA CARTE CÔTE À CÔTE — 20 septembre 2026, « remets la
     carte d'identité sur la lettre d'engagement » (Yéman) : la page ne les
     porte l'un sous l'autre qu'au prix d'un débordement. */
  .bas { display:flex; align-items:flex-start; gap:5mm; margin:0 0 2.6mm; }
  .bas .ech { flex:1 1 auto; min-width:0; margin:0; }
  /* LA COLONNE DE DROITE SE MESURE SUR LA CARTE, PAS SUR SON LIBELLÉ
     (20 septembre 2026) : le titre tenait sur une ligne et élargissait le
     bloc, jusqu'à pousser la colonne « reste dû » hors de la feuille. */
  .bas .identite { flex:0 0 auto; margin:0; max-width:70mm; }
  .bas .identite .etq { white-space:normal; line-height:1.35; }
  /* LA CARTE NE MANGE PAS L'ÉCHÉANCIER (20 septembre 2026) : à pleine
     largeur, elle repoussait la colonne « reste dû » du second groupe hors
     de la feuille, qui coupe ce qui dépasse. */
  .feuille--engagement .carte-photo { max-height:50mm; max-width:70mm; }
  .ech { margin:0 0 2.6mm; font-size:8.4pt; color:var(--encre-d); }
  .ech .etq { display:block; margin-bottom:1.2mm; }
  .ech table { width:100%; border-collapse:collapse; }
  .ech td, .ech th { padding:.75mm .6mm; text-align:right; white-space:nowrap; }
  .ech th { font-family:'Jost',sans-serif; font-size:7.6pt; font-weight:500; letter-spacing:.08em; text-transform:uppercase;
            border-bottom:.4pt solid var(--filet); }
  .ech td:first-child, .ech th:first-child, .ech .sep + td, .ech .sep + th { text-align:left; }
  .ech .sep { width:5mm; }
  .ech .creux { text-align:center; color:var(--filet); }
  .mention { font-size:8pt; color:var(--encre-d); margin:0 0 .8mm; line-height:1.35; text-align:left; }
  .cases { display:flex; flex-direction:column; gap:1.6mm; font-size:9pt; }
  .case { display:inline-block; width:3.2mm; height:3.2mm; border:.7pt solid #4a463f; margin-right:1.8mm; vertical-align:-.4mm; }
  .identite { margin-top:3mm; }
  .zone .identite { margin:0 0 4mm; }
  .cartes { display:flex; gap:5mm; }
  .carte-id { width:85.6mm; height:54mm; flex:none; border:.8pt dashed #8b8578; border-radius:3mm; display:flex; align-items:center;
              justify-content:center; text-align:center; font-size:8.2pt; color:var(--encre-d); padding:4mm; line-height:1.4; }
  /* Sur l'engagement, la même carte qu'en page 1 : plus petite, elle laisse
     la place au calendrier des retenues (19 septembre 2026). */
  .carte-photo { display:block; max-width:100%; max-height:68mm; width:auto; height:auto; border:.6pt solid var(--filet); border-radius:2mm; }
  .carte-id b { display:block; font-family:'Cormorant Garamond',Georgia,serif; font-size:12pt; font-weight:400; color:var(--indigo); margin-bottom:1mm; }
  .pied-page { margin-top:3mm; padding-top:2mm; border-top:.4pt solid var(--filet); font-size:7.2pt; color:var(--encre-d); display:flex; justify-content:space-between; gap:6mm; }
  @page { size:A4; margin:0; }
  @media print {
    body { background:#fff; }
    .barre { display:none !important; }
    .feuilles { padding:0; gap:0; display:block; overflow:visible; }
    .feuille { box-shadow:none; break-after:page; page-break-after:always; }
    .feuille:last-child { break-after:auto; page-break-after:auto; }
  }
`;

const carteIdentite = (titre: string, identite?: DonneesDesLettres['identite']): string => (identite
  /* LA CARTE DE LA FICHE, DÉJÀ POSÉE : dans la même hauteur que les deux
     cases (54 mm), pour que chaque lettre tienne toujours sur sa page. */
  ? `
  <div class="identite">
    <span class="etq">${titre}</span>
    <img class="carte-photo" src="${identite.donnees}" alt="Pièce d'identité du membre" />
  </div>`
  : `
  <div class="identite">
    <span class="etq">${titre}</span>
    <div class="cartes">
      <div class="carte-id"><div><b>Recto</b>Coller ou agrafer ici la copie du recto</div></div>
      <div class="carte-id"><div><b>Verso</b>Coller ou agrafer ici la copie du verso</div></div>
    </div>
  </div>`);

/** Le pictogramme de la Maison, par une adresse entière : la fenêtre
    d'impression, ouverte sur une page blanche, ne résout pas les adresses
    relatives. */
const adresseDuPicto = (): string =>
  new URL(`${import.meta.env.BASE_URL}assets/photos/site/mono-indigo.png`, window.location.origin).href;

/** Les deux lettres, en une page HTML imprimable. `picto` : l'adresse du
    pictogramme ; vide, l'en-tête s'en passe. */
export function lettresDuPretHtml(d: DonneesDesLettres, picto = ''): string {
  const maison = maisonNom();
  const raison = maisonRaison();
  const societe = raison.split('·')[0].trim() || maison;
  const ville = maisonVille();
  const entete = (reference: string) => `
    <div class="entete">
      <div class="marque">
        ${picto ? `<img class="picto" src="${echappe(picto)}" alt="" onerror="this.remove()" />` : ''}
        <div class="maison">${echappe(maison)}<small>${echappe(raison)} &middot; ${echappe(ville)}</small></div>
      </div>
      <div class="reference">${reference}</div>
    </div>`;
  const plafond = d.plafondPct != null && d.plafondPct > 0
    ? `<span class="v">${pct(d.plafondPct)}</span>`
    : '<span class="blanc" style="--l:10mm"></span>';
  const lettres = echappe(nombreEnLettres(d.montantXof));
  const chiffres = francs(d.montantXof);
  const le = jourLong(d.date);

  const demande = `
  <article class="feuille">
    ${entete('Demande de prêt<br />Pièce 1 sur 2')}
    <div class="coord">
      <div>
        <span class="etq">De</span>
        Nom et prénoms : ${champ(d.nom, 50)}<br />
        Fonction : ${champ(d.fonction, 50)}<br />
        Demeurant à ${champ(undefined, 44)}<br />
        Téléphone ${champ(d.telephone, 44)}
      </div>
      <div class="a">
        <span class="etq">À</span>
        La Direction ${echappe(deLaMaison(maison))}<br />${echappe(societe)}<br />${echappe(ville)}
      </div>
    </div>
    <p style="text-align:right">${echappe(ville)}, le <span class="v">${le}</span></p>
    <h2 class="objet"><small>Objet</small>Demande de prêt sans intérêt</h2>
    <p>Madame, Monsieur,</p>
    <p>Employé(e) ${echappe(deLaMaison(maison))} en qualité de ${champ(d.fonction?.toLowerCase(), 30)}
    depuis le ${champ(d.depuis ? jourLong(d.depuis) : undefined, 30)}, j'ai l'honneur de solliciter un prêt sans
    intérêt de <span class="v">${lettres}</span> francs CFA (<span class="v nw">${chiffres}</span> F), pour le motif
    suivant :<br />${d.motif?.trim()
    ? `<span class="v">${echappe(d.motif.trim())}</span>`
    : '<span class="blanc blanc--plein"></span>'}</p>
    <p>Je propose de le rembourser par une retenue sur mon salaire de base, qui est aujourd'hui de
    <span class="v nw">${francs(d.baseXof)}</span> F : <span class="v">${pct(d.partPct)}</span> % de ce salaire, soit
    <span class="v nw">${francs(d.mensXof)}</span> F par mois, pendant <span class="v">${d.mois}</span> mois, à compter
    du bulletin ${duMois(d.premierMois)}.</p>
    <p>Je joins à cette demande la copie de ma carte d'identité ou de mon CIP, et vous prie d'agréer, Madame, Monsieur,
    l'expression de ma considération respectueuse.</p>
    <div class="zone">
      <!-- LA CARTE AVANT LES SIGNATURES (20 septembre 2026, Yéman) : on la
           regarde en signant, pas après avoir signé. -->
      ${carteIdentite(`Copie de la carte d'identité ou du CIP, n° <span class="blanc" style="--l:40mm"></span>`, d.identite)}
      <div class="deux">
        <div class="bloc">
          <span class="etq">Signature</span>
          <div class="pied">Nom et prénoms : ${champ(d.nom, 48)}</div>
        </div>
        <div class="bloc">
          <span class="etq">Décision de la Maison, réservée à la Direction</span>
          <div class="cases">
            <span><span class="case"></span>Accordé tel que demandé</span>
            <span><span class="case"></span>Accordé ainsi : ………… F, ……… % sur ……… mois</span>
            <span><span class="case"></span>Refusé</span>
          </div>
          <div class="pied">Le ………………… &middot; signature et cachet</div>
        </div>
      </div>
      <div class="pied-page"><span>${echappe(maison)} &middot; demande de prêt sans intérêt</span><span>À conserver au dossier du membre</span></div>
    </div>
  </article>`;

  /* LE BAS DE L'ENGAGEMENT : l'échéancier, et la carte à côté quand la fiche
     en porte une. SANS photo, pas de cases à coller ici : une case de la
     taille d'une carte (85,6 × 54 mm) ne tient plus sous l'échéancier, et la
     demande, en page 1, garde les siennes en pleine taille. */
  const basDeLEngagement = (): string => {
    const ech = d.plan?.length ? echeancierDesRetenues(d.plan) : '';
    const carte = d.identite ? carteIdentite("Copie de la carte d'identité ou du CIP", d.identite) : '';
    if (ech && carte) return `<div class="bas">${ech}${carte}</div>`;
    return ech || carte;
  };

  const engagement = `
  <article class="feuille feuille--engagement">
    ${entete('Engagement de remboursement<br />Pièce 2 sur 2')}
    <h2 class="objet"><small>Lettre d'engagement</small>Reconnaissance de prêt et autorisation de retenue sur salaire</h2>
    <p>Je soussigné(e), ${champ(d.nom, 56)}, titulaire de la carte d'identité ou du CIP n°
    <span class="blanc" style="--l:30mm"></span>, demeurant à <span class="blanc" style="--l:40mm"></span>,
    employé(e) de ${echappe(societe)}, ${echappe(maison)}, en qualité de <span class="nw">${champ(d.fonction?.toLowerCase(), 32)},</span></p>
    <p><b>reconnais avoir reçu</b> ${echappe(deLaMaison(maison))}, le <span class="v">${le}</span>, la somme de
    <span class="v">${lettres}</span> francs CFA (<span class="v nw">${chiffres}</span> F), à titre de
    <b>prêt sans intérêt</b>. Je ne devrai à la Maison que cette somme, et rien au-delà.</p>
    <p><b>Je m'engage à la rembourser</b> par des retenues sur mon salaire, dans les conditions suivantes :</p>
    <ol>
      <li><b>La retenue</b> est de <span class="v">${pct(d.partPct)}</span> % de mon salaire de base, soit
      <span class="v nw">${francs(d.mensXof)}</span> F par mois à ce jour, à compter du bulletin
      ${duMois(d.premierMois)}, pendant <span class="v">${d.mois}</span> mois, selon l'échéancier ci-dessous.</li>
      <li><b>Si mon salaire de base change</b>, la même part s'applique au nouveau salaire : le remboursement
      s'en trouve raccourci ou allongé d'autant.</li>
      <li><b>Une retenue ne dépasse jamais</b> ${plafond} % de mon salaire net du mois, plafond fixé par la
      Maison. Si une retenue est réduite, parce qu'elle atteint ce plafond ou à ma demande acceptée par la
      Maison, la différence est reportée à la fin du prêt.</li>
      <li><b>Si mon contrat prend fin</b> avant le remboursement complet, le solde restant dû sera retenu sur
      les dernières sommes qui me seront versées, dans les limites prévues par la loi. Le reliquat éventuel
      restera dû, et je m'engage à le rembourser selon un échéancier convenu avec la Maison.</li>
    </ol>
    ${basDeLEngagement()}
    <p><b>J'autorise ${echappe(avecArticle(maison))}</b> à opérer ces retenues sur mes bulletins de paie jusqu'au
    remboursement complet. Chaque bulletin indique la retenue du mois et ce qui reste dû.</p>
    <p>Fait à ${echappe(ville)}, le <span class="v">${le}</span>, en deux exemplaires, dont un m'est remis.</p>
    <div class="zone">
      <div class="deux">
        <div class="bloc">
          <span class="etq">Le membre de l'équipe</span>
          <p class="mention">Écrire à la main : « Lu et approuvé, bon pour la somme de ${lettres} francs CFA
          (<span class="nw">${chiffres}</span> F). »</p>
          <div class="ligne"></div><div class="ligne"></div>
          <div class="pied">Signature</div>
        </div>
        <div class="bloc">
          <span class="etq">Pour ${echappe(avecArticle(maison))}</span>
          <div class="mention">Nom et qualité</div>
          <div class="ligne"></div>
          <div class="pied">Signature et cachet</div>
        </div>
      </div>
      ${d.identite ? '' : '<p class="mention">La copie de la carte d’identité ou du CIP est jointe à la demande de prêt, pièce 1 sur 2.</p>'}
      <div class="pied-page"><span>${echappe(maison)} &middot; prêt sans intérêt, autorisation de retenue sur salaire</span><span>Un exemplaire au membre, un au dossier</span></div>
    </div>
  </article>`;

  /* CE QUI RESTE À VALIDER SE DIT À L'ÉCRAN, JAMAIS SUR LE PAPIER : la
     barre ne s'imprime pas. */
  const aValider = d.plafondPct == null
    ? 'le taux du plafond, laissé en blanc à la clause 3, et la clause 4, sur le départ du membre'
    : 'la clause 4, sur le départ du membre';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lettres du prêt · ${echappe(d.nom)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Jost:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style></head>
<body>
  <div class="barre">
    <b>Les lettres du prêt</b>
    <span class="note">À faire relire par votre comptable avant la première signature : ${aValider}.
    Deux exemplaires de l'engagement : un pour le membre, un pour le dossier.
    <b>Pour en garder un PDF</b> : cliquez ci-contre, puis choisissez « Enregistrer au format PDF »
    comme destination. Le fichier se partage ensuite comme n'importe quel document.</span>
    <button type="button" onclick="window.print()">Imprimer ou enregistrer en PDF</button>
  </div>
  <div class="feuilles">${demande}${engagement}</div>
</body></html>`;
}

/** Ouvre les lettres dans une fenêtre d'impression. Faux si le navigateur
    a refusé la fenêtre : l'appelant le dit, au lieu d'un clic sans effet.

    LA FENÊTRE S'OUVRE AVANT D'ATTENDRE LA CARTE (19 septembre 2026) : ouverte
    après une attente, le navigateur la prendrait pour une fenêtre surgissante
    et la bloquerait. Elle dit qu'elle prépare, puis reçoit les lettres. */
export function ouvreLesLettresDuPret(
  d: DonneesDesLettres,
  identite?: Promise<DonneesDesLettres['identite'] | null>,
): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const ecris = (html: string) => { w.document.open(); w.document.write(html); w.document.close(); };
  if (!identite) { ecris(lettresDuPretHtml(d, adresseDuPicto())); return true; }
  ecris('<!doctype html><meta charset="utf-8"><title>Lettres du prêt</title><p style="font-family:system-ui,sans-serif;margin:40px;color:#1E2150">Préparation des lettres, avec la pièce d’identité…</p>');
  void identite
    .catch(() => null)
    .then((carte) => { if (!w.closed) ecris(lettresDuPretHtml({ ...d, identite: carte ?? undefined }, adresseDuPicto())); });
  return true;
}
