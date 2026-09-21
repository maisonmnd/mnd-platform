/* LES LETTRES DU PRÊT RANGÉES AU DOSSIER, ÉPROUVÉES — `node scripts/verifie-lettres-au-dossier.mjs`.

   « J'aimerais sauvegarder le PDF des lettres d'engagement et partager »
   (Yéman, 20 septembre 2026). Maquette `maquette-les-lettres-au-dossier.html`.

   DEUX DESSINS, UN SEUL TEXTE. La lettre vit en HTML pour la fenêtre
   d'impression et en PDF pour le coffre. Ce harnais garde ce qui compte : le
   chemin qui réserve à la direction, les deux états d'une lettre, et surtout
   que CHAQUE phrase du PDF se retrouve mot pour mot dans la lettre à
   l'écran. Le jour où l'une bouge sans l'autre, il le dit. */
import {
  dossierDesLettresDuPret, nomDeLaLettre, litLeNomDeLaLettre,
} from '../src/shared/engagements-coffre';
import { lettresDuPretHtml, type DonneesDesLettres } from '../src/apps/trone/routes/finances/lettres-du-pret';
import {
  phrasesDesLettres, lignesDeLEcheancier, mentionDuPret, VERSION_DES_LETTRES,
  type LettresDuPretPdf,
} from '../src/apps/trone/routes/finances/lettres-du-pret-pdf';
import { maisonNom, maisonRaison, maisonVille } from '../src/shared/identite';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── LE CHEMIN RÉSERVE À LA DIRECTION ──────────────────────────── */
const dossiersDe = (chemin: string) => chemin.split('/');
dit('① les lettres portent « identite » en deuxième dossier : direction seule',
  'identite', dossiersDe(dossierDesLettresDuPret('s1'))[1]);
dit('② deux membres, deux dossiers', false,
  dossierDesLettresDuPret('s1') === dossierDesLettresDuPret('s2'));

/* ── LE NOM DIT LE PRÊT ET L'ÉTAT ──────────────────────────────── */
const nomVierge = nomDeLaLettre('p1', 'vierge', 'ab12cd34', 'lettres-du-pret.pdf');
const nomSignee = nomDeLaLettre('p1', 'signee', 'ef56gh78', 'lettres-signees.jpg');
dit('③ une lettre vierge se relit', { pretId: 'p1', etat: 'vierge', nom: 'lettres-du-pret.pdf' }, litLeNomDeLaLettre(nomVierge));
dit('④ une lettre signée aussi', { pretId: 'p1', etat: 'signee', nom: 'lettres-signees.jpg' }, litLeNomDeLaLettre(nomSignee));
dit('⑤ un fichier venu d’ailleurs ne se prend pas pour une lettre', null, litLeNomDeLaLettre('photo-du-chantier.jpg'));
dit('⑥ un état inconnu non plus', null, litLeNomDeLaLettre('p1__brouillon__x-y.pdf'));

/* ── L'ÉCHÉANCIER TIENT SUR LA PAGE ────────────────────────────── */
const plan = (n: number) => Array.from({ length: n }, (_, k) => ({
  mois: `2026-${String((k % 12) + 1).padStart(2, '0')}`,
  retenueXof: k === n - 1 ? 12_000 : 30_000,
  resteApresXof: k === n - 1 ? 0 : (n - 1 - k) * 30_000,
}));
dit('⑦ quatorze bulletins se disent tous', 14, lignesDeLEcheancier(plan(14)).length);
dit('⑧ au-delà, quatorze lignes encore, dont un creux', [14, 1],
  [lignesDeLEcheancier(plan(60)).length, lignesDeLEcheancier(plan(60)).filter((l) => l === null).length]);
dit('⑨ et les deux derniers bulletins y sont toujours',
  ['2026-11', '2026-12'], lignesDeLEcheancier(plan(60)).slice(-2).map((l) => l?.mois));

/* ── LE MÊME TEXTE DES DEUX CÔTÉS ──────────────────────────────── */
const d: DonneesDesLettres = {
  nom: 'M. C. A.', fonction: 'Maîtresse praticienne', telephone: '+229 01 90 00 00 00',
  depuis: '2024-03-12', montantXof: 1_275_500, date: '2026-09-20',
  motif: 'Frais de scolarité', baseXof: 185_000, partPct: 22.5, mensXof: 106_292,
  mois: 13, premierMois: '2026-10', plafondPct: 30, plan: plan(13),
};
const jourLong = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const moisLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const raison = maisonRaison();
const p: LettresDuPretPdf = {
  maison: maisonNom(), raison, ville: maisonVille(),
  deLaMaison: `de la ${maisonNom()}`, avecArticle: `la ${maisonNom()}`,
  societe: raison.split('·')[0].trim(),
  nom: d.nom, fonction: d.fonction, telephone: d.telephone, depuisDit: jourLong(d.depuis!),
  montantXof: d.montantXof, montantEnLettres: 'un million deux cent soixante-quinze mille cinq cents',
  dateDite: jourLong(d.date), motif: d.motif, baseXof: d.baseXof, partPct: d.partPct,
  mensXof: d.mensXof, mois: d.mois, premierMoisDit: `du mois d’${moisLong(d.premierMois)}`,
  plafondPct: d.plafondPct, plan: d.plan, moisCourt: (m) => m,
};

/** SERRER LES BLANCS. Retirer les balises laisse un espace autour de chaque
    valeur (« 2024 , j’ai ») : on le reprend, des deux côtés, sinon la
    comparaison échouerait sur des espaces et non sur des mots. */
const serre = (s: string): string => s
  .replace(/[’']/g, '’')
  .replace(/…+/g, '…')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?)])/g, '$1')
  .replace(/([(’]) +/g, '$1')
  .trim();

/** Le texte visible d'une lettre, les cases à remplir devenues « … ». */
const texteVisible = (html: string): string => serre(html
  .replace(/<span class="blanc"[^>]*><\/span>/g, '…')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));

const alEcran = texteVisible(lettresDuPretHtml(d));
const duPdf = phrasesDesLettres(p);
const nettoie = serre;
/* LA MENTION QU'ON FAIT RECOPIER À L'ÉCRAN est la même que celle imprimée
   sur la lettre : sans cela, on ferait écrire autre chose que ce que le
   papier demande. */
const mention = mentionDuPret(p.montantEnLettres, p.montantXof);
const absentes = [...duPdf.demande, ...duPdf.engagement, ...duPdf.clauses, mention]
  .filter((phrase) => !alEcran.includes(nettoie(phrase)));
dit('⑩ CHAQUE PHRASE DU PDF SE RETROUVE DANS LA LETTRE À L’ÉCRAN', [], absentes.map((p2) => p2.slice(0, 70)));
dit('⑪ la version du texte signé est datée', true, /^lettres-du-pret-\d{4}-\d{2}-\d{2}$/.test(VERSION_DES_LETTRES));
dit('⑫ la mention dit la somme en lettres ET en chiffres',
  [true, true], [mention.includes(p.montantEnLettres), mention.includes('1 275 500 F')]);
if (absentes.length) {
  for (const phrase of absentes.slice(0, 3)) {
    const n = nettoie(phrase);
    let k = 0;
    while (k < n.length && alEcran.includes(n.slice(0, k + 1))) k++;
    console.log(`
  PDF    …${n.slice(Math.max(0, k - 40), k + 30)}`);
    const pos = alEcran.indexOf(n.slice(Math.max(0, k - 40), k));
    console.log(`  ÉCRAN  …${alEcran.slice(Math.max(0, pos), pos + 70)}`);
    console.log(`  divergent au caractère ${k} : PDF « ${n.slice(k, k + 12)} »`);
  }
}

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
