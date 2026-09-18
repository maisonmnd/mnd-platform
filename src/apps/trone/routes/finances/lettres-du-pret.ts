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
   et la dette d'un membre ne quittent pas la page qui les écrit. */

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
};

const echappe = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const francs = (n: number): string => Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ');
const pct = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
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
  .nw { white-space:nowrap; }
  .zone { margin-top:auto; }
  .deux { display:grid; grid-template-columns:1fr 1fr; gap:6mm; }
  .bloc { border:.6pt solid var(--filet); border-radius:1.5mm; padding:3mm 4mm; min-height:33mm; display:flex; flex-direction:column; }
  .bloc .ligne { border-bottom:.6pt dotted #6b6559; height:5.6mm; }
  .bloc .pied { margin-top:auto; padding-top:2mm; font-size:8pt; color:var(--encre-d); }
  .mention { font-size:8.4pt; color:var(--encre-d); margin:0 0 1mm; line-height:1.4; text-align:left; }
  .cases { display:flex; flex-direction:column; gap:1.6mm; font-size:9pt; }
  .case { display:inline-block; width:3.2mm; height:3.2mm; border:.7pt solid #4a463f; margin-right:1.8mm; vertical-align:-.4mm; }
  .identite { margin-top:3mm; }
  .cartes { display:flex; gap:5mm; }
  .carte-id { width:85.6mm; height:54mm; flex:none; border:.8pt dashed #8b8578; border-radius:3mm; display:flex; align-items:center;
              justify-content:center; text-align:center; font-size:8.2pt; color:var(--encre-d); padding:4mm; line-height:1.4; }
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

const carteIdentite = (titre: string): string => `
  <div class="identite">
    <span class="etq">${titre}</span>
    <div class="cartes">
      <div class="carte-id"><div><b>Recto</b>Coller ou agrafer ici la copie du recto</div></div>
      <div class="carte-id"><div><b>Verso</b>Coller ou agrafer ici la copie du verso</div></div>
    </div>
  </div>`;

/** Les deux lettres, en une page HTML imprimable. */
export function lettresDuPretHtml(d: DonneesDesLettres): string {
  const maison = maisonNom();
  const raison = maisonRaison();
  const societe = raison.split('·')[0].trim() || maison;
  const ville = maisonVille();
  const entete = (reference: string) => `
    <div class="entete">
      <div class="maison">${echappe(maison)}<small>${echappe(raison)} &middot; ${echappe(ville)}</small></div>
      <div class="reference">${reference}</div>
    </div>`;
  const lettres = echappe(nombreEnLettres(d.montantXof));
  const chiffres = francs(d.montantXof);
  const le = jourLong(d.date);
  const plafond = d.plafondPct != null && d.plafondPct > 0
    ? `<span class="v">${pct(d.plafondPct)}</span>`
    : '<span class="blanc" style="--l:10mm"></span>';

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
        La Direction de la ${echappe(maison)}<br />${echappe(societe)}<br />${echappe(ville)}
      </div>
    </div>
    <p style="text-align:right">${echappe(ville)}, le <span class="v">${le}</span></p>
    <h2 class="objet"><small>Objet</small>Demande de prêt sans intérêt</h2>
    <p>Madame, Monsieur,</p>
    <p>Employé(e) de la ${echappe(maison)} en qualité de ${champ(d.fonction?.toLowerCase(), 30)}
    depuis le ${champ(d.depuis ? jourLong(d.depuis) : undefined, 30)}, j'ai l'honneur de solliciter un prêt sans
    intérêt de <span class="v">${lettres}</span> francs CFA (<span class="v nw">${chiffres}</span> F), pour le motif
    suivant : <span class="nw">${champ(d.motif, 78)}.</span></p>
    <p>Je propose de le rembourser par une retenue sur mon salaire de base, qui est aujourd'hui de
    <span class="v nw">${francs(d.baseXof)}</span> F : <span class="v">${pct(d.partPct)}</span> % de ce salaire, soit
    <span class="v nw">${francs(d.mensXof)}</span> F par mois, pendant <span class="v">${d.mois}</span> mois, à compter
    du bulletin ${duMois(d.premierMois)}.</p>
    <p>Je joins à cette demande la copie de ma carte d'identité, et vous prie d'agréer, Madame, Monsieur,
    l'expression de ma considération respectueuse.</p>
    <div class="zone">
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
      ${carteIdentite(`Copie de la carte d'identité, n° <span class="blanc" style="--l:40mm"></span>`)}
      <div class="pied-page"><span>${echappe(maison)} &middot; demande de prêt sans intérêt</span><span>À conserver au dossier du membre</span></div>
    </div>
  </article>`;

  const engagement = `
  <article class="feuille">
    ${entete('Engagement de remboursement<br />Pièce 2 sur 2')}
    <h2 class="objet"><small>Lettre d'engagement</small>Reconnaissance de prêt et autorisation de retenue sur salaire</h2>
    <p>Je soussigné(e), ${champ(d.nom, 56)}, titulaire de la carte d'identité n°
    <span class="blanc" style="--l:30mm"></span>, demeurant à <span class="blanc" style="--l:40mm"></span>,
    employé(e) de ${echappe(societe)}, ${echappe(maison)}, en qualité de <span class="nw">${champ(d.fonction?.toLowerCase(), 32)},</span></p>
    <p><b>reconnais avoir reçu</b> de la ${echappe(maison)}, le <span class="v">${le}</span>, la somme de
    <span class="v">${lettres}</span> francs CFA (<span class="v nw">${chiffres}</span> F), à titre de
    <b>prêt sans intérêt</b>. Je ne devrai à la Maison que cette somme, et rien au-delà.</p>
    <p><b>Je m'engage à la rembourser</b> par des retenues sur mon salaire, dans les conditions suivantes :</p>
    <ol>
      <li><b>La retenue</b> est de <span class="v">${pct(d.partPct)}</span> % de mon salaire de base, soit
      <span class="v nw">${francs(d.mensXof)}</span> F par mois à ce jour, à compter du bulletin
      ${duMois(d.premierMois)}, pendant <span class="v">${d.mois}</span> mois environ.
      La dernière retenue se limite à ce qui reste dû.</li>
      <li><b>Si mon salaire de base change</b>, la même part s'applique au nouveau salaire : le remboursement
      s'en trouve raccourci ou allongé d'autant.</li>
      <li><b>Une retenue ne dépasse jamais</b> ${plafond} % de mon salaire net du mois, plafond fixé par la
      Maison. Si une retenue est réduite, parce qu'elle atteint ce plafond ou à ma demande acceptée par la
      Maison, la différence est reportée à la fin du prêt.</li>
      <li><b>Si mon contrat prend fin</b> avant le remboursement complet, le solde restant dû sera retenu sur
      les dernières sommes qui me seront versées, dans les limites prévues par la loi. Le reliquat éventuel
      restera dû, et je m'engage à le rembourser selon un échéancier convenu avec la Maison.</li>
    </ol>
    <p><b>J'autorise la ${echappe(maison)}</b> à opérer ces retenues sur mes bulletins de paie jusqu'au
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
          <span class="etq">Pour la ${echappe(maison)}</span>
          <div class="mention">Nom et qualité</div>
          <div class="ligne"></div>
          <div class="pied">Signature et cachet</div>
        </div>
      </div>
      ${carteIdentite("Copie de la carte d'identité du membre")}
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
    Deux exemplaires de l'engagement : un pour le membre, un pour le dossier.</span>
    <button type="button" onclick="window.print()">Imprimer</button>
  </div>
  <div class="feuilles">${demande}${engagement}</div>
</body></html>`;
}

/** Ouvre les lettres dans une fenêtre d'impression. Faux si le navigateur
    a refusé la fenêtre : l'appelant le dit, au lieu d'un clic sans effet. */
export function ouvreLesLettresDuPret(d: DonneesDesLettres): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(lettresDuPretHtml(d));
  w.document.close();
  return true;
}
