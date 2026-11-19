/* LE PLAN PART AVEC LE CHEMIN, EPROUVE — 19 novembre 2026.
   `node scripts/verifie-le-plan-avec-le-chemin.mjs` ; `--prouve` remet chaque panne.

   « At all time this map needs to be attached to the message when we send the
   link to the clients when they need to come to the salon and they ask us the
   address » (Yeman).

     A. LA REGLE (`donneLeChemin`, opale-pur) : l'adresse d'Opale, le lien pour
        venir, un lien Google Maps, l'adresse de la branche ; rien d'autre ;
     B. OPALE (whatsapp-automate) : le plan pose par le code, la demande lue
        dans un vocal aussi (le tour lui-meme se juge dans verifie-opale) ;
     C. LE TRONE, sur la lettre : Conversations joint le plan seul, le
        WhatsApp programme le garde en fichier, l'ecran des QR codes le
        partage ou le copie. */
import { readFileSync } from 'node:fs';
import { donneLeChemin } from '../src/shared/opale-pur';

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let vus = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  vus += 1;
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
const lis = (rel: string): string => {
  const copie = process.env.PLAN_PANNE_FICHIER === rel ? process.env.PLAN_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/* ══ A. LA REGLE ═════════════════════════════════════════════════════ */
const ADRESSE = 'Maison 88 Portail Marron';
dit('le chemin donne : l adresse d Opale, le lien pour venir, Google Maps court et long, l adresse de la branche',
  [true, true, true, true, true, true],
  ['Ilot 130-F, Maison 88, a Suru-Lere', 'Le chemin : https://maisonmnd.com/venir/', 'https://maps.app.goo.gl/51Nfss',
    'https://www.google.com/maps/place/Maison+MND', 'https://goo.gl/maps/abc', 'Nous sommes a la maison 88  portail marron, face a Sica']
    .map((t) => donneLeChemin(t, ADRESSE)));
dit('pas le chemin : un merci, une heure, une ville, un lien d avis, une adresse trop courte', [false, false, false, false, false],
  [donneLeChemin('Merci, a samedi', ADRESSE), donneLeChemin('Votre rendez-vous est a 10 h', ADRESSE), donneLeChemin('Nous sommes a Cotonou', ADRESSE),
    donneLeChemin('Votre avis : https://g.page/r/maisonmnd/review', ADRESSE), donneLeChemin('Akpakpa', 'Akpakpa')]);
dit('une branche sans adresse : les liens suffisent', [true, false], [donneLeChemin('https://maps.app.goo.gl/x', ''), donneLeChemin('Maison 88 Portail Marron', '')]);

/* ══ B. OPALE ════════════════════════════════════════════════════════ */
const WA = lis('supabase/functions/whatsapp-automate/index.ts');
dit('Opale : le plan pose par le code, a qui demande le chemin (vocal compris) ou quand son mot le donne', [true, true], [
  WA.includes("const textesDuTour = nouveaux.map((m) => [m.texte, m.transcription ?? ''].join(' ')).join(' ');"),
  WA.includes("if (!issue.silence && (demandeLeCheminWa(textesDuTour) || donneLeChemin(issue.texte, String(agenda?.lignes.branche.data?.address ?? '')))) issue.plan = true;")]);
dit('... la regle est celle du Trone (copie de opale-pur)', true, WA.includes('export function donneLeChemin(texte: string, adresse = \'\'): boolean {'));

/* ══ C. LE TRONE ═════════════════════════════════════════════════════ */
const CO = lis('src/apps/trone/routes/clients/ComposeurWhatsApp.tsx');
const PR = lis('src/apps/trone/shell/ProgrammerUnWhatsApp.tsx');
const QR = lis('src/apps/trone/routes/clients/QrCodes.tsx');
const PP = lis('src/apps/trone/routes/clients/plan-pour-venir.ts');
dit('Conversations : un mot qui donne le chemin emporte le plan, sans autre piece, et il revient si on le retire', [true, true, true], [
  CO.includes("const parleDuChemin = donneLeChemin(texte, branch.address ?? '');"),
  CO.includes("if (!parleDuChemin || piece || planRefuse.current === fil.numero) return;"),
  CO.includes("joinsLePlan('Plan pour venir à la Maison', () => { planRefuse.current = fil.numero; });")]);
dit('... le geste Itineraire passe par le meme plan, qui part avant le texte', [true, true],
  [CO.includes('joinsLePlan(g.piece.nom);'), CO.includes('setPlanDAbord(true);')]);
dit('WhatsApp programme : l itineraire, ou un mot sans piece qui donne le chemin, garde le plan en fichier', [true, true, true], [
  PR.includes("const avecLePlan = piece === 'itineraire' || (piece === 'aucune' && donneLeChemin(texte, branch.address ?? ''));"),
  PR.includes('const plan = await leFichierDuPlan();\n      const d = plan ? await deposeLeFichier(lotId, plan) : null;'),
  PR.includes('Le plan pour venir part avec ce message, en image.')]);
dit('QR codes : Nous trouver et l itineraire du jour partent avec le plan', [true, true], [
  QR.includes("if (id === 'plan') { void envoieAvecLePlan(message, lien, 'Pas de numéro sur sa fiche : le message'); return; }"),
  QR.includes("void envoieAvecLePlan(message, lien, 'Le message de l’itinéraire');")]);
dit('... le partage emporte l image et le mot ; sinon le plan copie et WhatsApp ouvert, dits a l ecran', [true, true, true], [
  PP.includes('await navigator.share({ files: [plan], text: message });'),
  PP.includes("await navigator.clipboard.write([new ClipboardItem({ 'image/png': plan })]);"),
  QR.includes("if (r === 'copie') toast('Le plan est copié : collez-le (Ctrl+V) dans la conversation WhatsApp, puis envoyez.');")]);
dit('... le plan est l image servie par le Trone, celle d Opale', [true, true],
  [PP.includes("export const CHEMIN_DU_PLAN = 'assets/itineraire/plan-depuis-super-u.png';"), WA.includes("const PLAN_POUR_VENIR = 'https://maisonmnd.com/assets/itineraire/plan-depuis-super-u.png';")]);

console.log(`\n${vus - ko}/${vus} epreuves : le plan part avec le chemin.`);
if (ko) process.exit(1);
