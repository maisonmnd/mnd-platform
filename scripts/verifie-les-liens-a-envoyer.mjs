import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES LIENS À ENVOYER, ÉPROUVÉS — 12 novembre 2026.
   La fenêtre « Créer › Lien de réservation » (et le bouton de la fiche)
   écrit six adresses du site, donne les liens des QR codes, et compose leurs
   messages. Ce banc vérifie, contre le site et le Trône eux-mêmes :
   · chaque parcours est un `besoin` que la page de réservation lit ET que le
     triage du site dit réservable ; la page /venir/ est bien construite ;
   · les adresses du site partent de l'origine DONNÉE, jamais d'un domaine
     écrit ; celles des QR codes ont une seule source, lue par les deux écrans ;
   · les liens des QR codes sont ceux de la page QR codes, sans le wifi ni le
     code du jour (règle du 18 août 2026) ;
   · les messages : appel facultatif, jamais un « Madame » supposé, pas de
     tiret cadratin, pas d'émoji, assez courts pour Conversations ;
   · la fenêtre est branchée au menu Créer, à la barre et à la fiche.
   `--prouve` plante des pannes dans une copie du module et exige que chacune
   fasse crier le banc.
   Lance : node scripts/verifie-les-liens-a-envoyer.mjs [--prouve] */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8');
/* Les commentaires effacés, retours à la ligne gardés : une explication qui
   cite une adresse n'est pas une adresse écrite (leçon du 24 septembre 2026). */
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SOURCE = 'src/shared/liens-a-envoyer-pur.ts';
const d = mkdtempSync(path.join(tmpdir(), 'liens-'));

/* Ce que le site sait lire, lu dans ses sources (jamais recopié ici). */
const listeDe = (texte, motif, ou) => {
  const m = texte.match(motif);
  if (!m) throw new Error(`introuvable : ${ou}`);
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
};
const LUS_PAR_LA_PAGE = listeDe(lis('src/apps/revelateur/ilots/Reserver.tsx'), /const besoinDeLAdresse[\s\S]*?\(\[([^\]]+)\]/, 'besoinDeLAdresse (Reserver.tsx)');
const RESERVABLES = listeDe(lis('src/apps/revelateur/ilots/Triage.tsx'), /const RESERVABLES = new Set<Besoin>\(\[([^\]]+)\]\)/, 'RESERVABLES (Triage.tsx)');
const GENERATEUR = lis('scripts/genere-revelateur.mjs');
const PAGE_QR = lis('src/apps/trone/routes/clients/QrCodes.tsx');
/* Les codes de la page QR codes, dans l'ordre de leur liste. */
const CODES_DE_LA_PAGE = [...PAGE_QR.matchAll(/^\s+id: '([a-z]+)', court:/gm)].map((x) => x[1]);
const SANS_LIEN = ['wifi', 'jour'];
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

async function charge(source, nom) {
  const ts = path.join(d, `${nom}.ts`);
  const out = path.join(d, `${nom}.mjs`);
  writeFileSync(ts, source);
  await build({ entryPoints: [ts], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

/** Les épreuves, sur un module et sa source. Rend la liste des échecs. */
function epreuves(m, source, parle) {
  const echecs = [];
  const dit = (nom, attendu, obtenu) => {
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) echecs.push(nom);
    if (parle) {
      console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`);
      if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
    }
  };
  const site = 'https://exemple.test/';
  const L = m.LIENS_A_ENVOYER;
  const Q = m.LIENS_DES_QR_CODES;

  /* ── Les liens du site ── */
  dit('six liens du site : la réservation, quatre parcours, l’itinéraire', ['tout', 'creation', 'reparation', 'entretien', 'enfant', 'venir'], L.map((l) => l.cle));
  dit('leurs groupes, dans l’ordre de la fenêtre', ['Réserver', 'Les consultations', 'Les soins', 'Pour venir'], m.GROUPES_DES_LIENS);
  dit('aucune adresse écrite dans la règle (commentaires mis à part)', [], sansCommentaires(source).match(/https?:\/\/|maisonmnd|\.com\b/g) ?? []);

  const besoins = L.map((l) => new URL(m.adresseDuLienAEnvoyer(site, l.cle)).searchParams.get('besoin')).filter(Boolean);
  dit('chaque parcours est lu par la page de réservation', besoins, besoins.filter((b) => LUS_PAR_LA_PAGE.includes(b)));
  dit('… et le triage du site le dit réservable', besoins, besoins.filter((b) => RESERVABLES.includes(b)));
  dit('les liens de réservation mènent à /reserver/', ['/reserver/'], [...new Set(L.filter((l) => l.cle !== 'venir').map((l) => new URL(m.adresseDuLienAEnvoyer(site, l.cle)).pathname))]);
  dit('l’itinéraire mène à /venir/, que le site construit', ['/venir/', true],
    [new URL(m.adresseDuLienAEnvoyer(site, 'venir')).pathname, /path\.join\(SORTIE, 'venir', 'index\.html'\)/.test(GENERATEUR)]);
  dit('l’adresse part de l’origine donnée, avec ou sans barre finale',
    ['https://exemple.test/reserver/?besoin=creation', 'https://exemple.test/reserver/?besoin=creation'],
    [m.adresseDuLienAEnvoyer('https://exemple.test/', 'creation'), m.adresseDuLienAEnvoyer('https://exemple.test', 'creation')]);
  dit('une clé inconnue retombe sur la réservation', 'https://exemple.test/reserver/', m.adresseDuLienAEnvoyer(site, 'nimporte'));

  /* ── Les liens des QR codes ── */
  const attendus = CODES_DE_LA_PAGE.filter((c) => !SANS_LIEN.includes(c));
  dit('les liens des QR codes sont ceux de la page, dans son ordre', attendus, Q.map((l) => l.cle));
  dit('ni le wifi ni le code du jour (18 août 2026)', [], Q.map((l) => l.cle).filter((c) => SANS_LIEN.includes(c)));
  dit('la page QR codes les lit bien dans leur source unique', true, /useLiensDesQrCodes\(\)/.test(PAGE_QR) && !/const lienSite = new URL\(|lienAbsolu/.test(PAGE_QR));

  /* ── Les messages ── */
  const avec = m.messageDuLienAEnvoyer(site, 'creation', 'Awa');
  dit('le message salue par l’appel donné', true, avec.startsWith('Bonjour Awa, voici le lien pour réserver votre consultation Première Couronne'));
  dit('… et porte l’adresse sur sa propre ligne', true, avec.split('\n').includes('https://exemple.test/reserver/?besoin=creation'));
  dit('sans appel : « Bonjour, », jamais un Madame supposé', [true, true, true],
    [m.messageDuLienAEnvoyer(site, 'tout').startsWith('Bonjour, voici '), m.messageDuLienAEnvoyer(site, 'tout', '   ').startsWith('Bonjour, voici '), m.messageDuLienDuQr('carte', 'https://exemple.test/carte.html').startsWith('Bonjour, voici ')]);
  dit('le lien d’un QR code est posé tel que le Trône le donne', true, m.messageDuLienDuQr('avis', 'https://g.page/r/exemple/review', 'Awa').split('\n').includes('https://g.page/r/exemple/review'));
  const tous = [
    ...L.flatMap((l) => [m.messageDuLienAEnvoyer(site, l.cle), m.messageDuLienAEnvoyer(site, l.cle, 'Mme Awa')]),
    ...Q.flatMap((l) => [m.messageDuLienDuQr(l.cle, 'https://exemple.test/x'), m.messageDuLienDuQr(l.cle, 'https://exemple.test/x', 'Mme Awa')]),
  ];
  dit('aucun « Madame » que l’appel n’a pas donné', [], tous.filter((t) => /madame/i.test(t)));
  dit('aucun tiret cadratin', [], tous.filter((t) => t.includes('—')));
  dit('aucun émoji', [], tous.filter((t) => EMOJI.test(t)));
  dit('assez court pour Conversations, signature comprise (1000 signes)', [], tous.filter((t) => t.length + 80 > 1000));
  dit('les réservations disent que la confirmation arrive sur WhatsApp', [], L.filter((l) => l.cle !== 'venir' && !m.messageDuLienAEnvoyer(site, l.cle).includes('La confirmation arrive ensuite sur WhatsApp.')).map((l) => l.cle));
  return echecs;
}

let ko = 0;
try {
  const source = lis(SOURCE);
  const m = await charge(source, 'liens');
  const base = epreuves(m, source, true);
  ko += base.length;

  /* LE BRANCHEMENT : la fenêtre est ouverte par le menu Créer, montée par la
     barre, ouverte depuis la fiche, et écrit depuis l'origine du Trône. */
  const fenetre = lis('src/apps/trone/shell/LiensAEnvoyer.tsx');
  const menu = lis('src/apps/trone/shell/MenuCreer.tsx');
  const barre = lis('src/apps/trone/shell/Shell.tsx');
  const fiche = lis('src/apps/trone/routes/clients/Customers.tsx');
  const vitrine = lis('src/apps/trone/routes/clients/Vitrine.tsx');
  const branche = [
    ['le menu Créer porte « Lien de réservation » en tête de Clientèle', /nom: 'Clientèle',\s*entrees: \[\s*\{ id: 'liens', label: 'Lien de réservation'/.test(menu)],
    ['la barre monte la fenêtre', /onLiens=\{\(\) => setLiensOuverts\(true\)\}/.test(barre) && /<LiensAEnvoyer surFermer=/.test(barre)],
    ['la fiche l’ouvre avec son appel et son numéro', /<LiensAEnvoyer\s+appel=\{/.test(fiche) && /numero=\{client\.phone/.test(fiche)],
    ['une fiche d’enfant ne prête pas son prénom (voix du numéro)', /ficheDEnfant = estMineur\(client, todayISO\(\)\) \|\| LIBELLE_PARENTAL\.test/.test(fiche) && /appelDuLien = ficheDEnfant \? ''/.test(fiche)],
    ['la fenêtre écrit depuis l’origine du Trône, sans domaine', /window\.location\.origin/.test(fenetre) && !/maisonmnd/.test(fenetre)],
    ['la fenêtre lit les liens des QR codes à leur source unique', /useLiensDesQrCodes\(\)/.test(fenetre)],
    ['Ma Couronne n’a qu’une adresse (Vitrine la reprend)', /export \{ lienMaCouronne \}/.test(vitrine) && /from '\.\/liens-des-qr-codes'/.test(vitrine) && !/export const lienMaCouronne/.test(vitrine)],
    ['deux portes : Conversations et l’App', /cheminDeLaConversation\(tel,/.test(fenetre) && /lienWaMe\(tel,/.test(fenetre) && />\s*App\s*</.test(fenetre)],
    ['le message est signé par le code, une fois', /signeLeMessage\(l\.message\)/.test(fenetre)],
  ];
  for (const [nom, ok] of branche) { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`); }

  if (process.argv.includes('--prouve')) {
    /* Chaque panne, plantée dans une COPIE du module, doit faire tomber une
       épreuve qui tenait sur le module sain. */
    const pannes = [
      ['un parcours que le site ne lit pas', (s) => s.replace("reserver/?besoin=creation'", "reserver/?besoin=creations'")],
      ['un domaine écrit dans la règle', (s) => s.replace("chemin: 'venir/'", "chemin: 'https://maisonmnd.com/venir/'")],
      ['un tiret cadratin dans un message', (s) => s.replace('La page ouvre Google Maps', 'La page — ouvre Google Maps')],
      ['un Madame supposé', (s) => s.replace("return `Bonjour${a ? ` ${a}` : ''}", "return `Bonjour${a ? ` ${a}` : ' Madame'}")],
      ['l’itinéraire perdu', (s) => s.replace(/\{\s*cle: 'venir'[\s\S]*?\r?\n  \},\r?\n/, '')],
      ['une réservation sans la confirmation', (s) => s.replace("suite: `Vous y choisissez son jour et son heure. ${SUITE_DE_LA_RESERVATION}`", "suite: 'Vous y choisissez son jour et son heure.'")],
      ['le code du jour glissé dans les liens', (s) => s.replace("export type CleDuQr = 'mtn'", "export type CleDuQr = 'jour' | 'mtn'").replace("export const LIENS_DES_QR_CODES: readonly LienDuQr[] = [", "export const LIENS_DES_QR_CODES: readonly LienDuQr[] = [\n  { cle: 'jour', nom: 'Le code du jour', sous: 'pointer', objet: 'le code du jour', suite: 'Pointez.' },")],
      ['un lien de QR code perdu', (s) => s.replace(/\n  \{ cle: 'avis'[\s\S]*?\},/, '')],
      ['un émoji dans un message', (s) => s.replace('Merci pour votre passage.', 'Merci pour votre passage \u{1F338}')],
    ];
    let muettes = 0;
    for (const [i, [nom, plante]] of pannes.entries()) {
      const casse = plante(source);
      if (casse === source) { muettes++; console.log(`ECHEC panne « ${nom} » : la plantation n’a rien changé`); continue; }
      const neuves = epreuves(await charge(casse, `panne-${i}`), casse, false).filter((e) => !base.includes(e));
      if (neuves.length === 0) { muettes++; console.log(`ECHEC panne « ${nom} » : le banc se tait`); }
      else console.log(`OK    panne « ${nom} » crie (${neuves[0]})`);
    }
    ko += muettes;
    console.log(`${pannes.length - muettes} pannes sur ${pannes.length} crient.`);
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
console.log(ko ? `\n${ko} échec(s).` : '\nLes liens à envoyer tiennent.');
process.exit(ko ? 1 : 0);
