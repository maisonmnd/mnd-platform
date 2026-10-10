/* L'IDENTITÉ DE LA MAISON, ÉPROUVÉE — `node scripts/verifie-l-identite-de-la-maison.mjs`
   (et `--prouve` pour remettre chaque faute et la voir crier).

   10 octobre 2026. La Maison est immatriculée depuis la veille (RCCM
   RB/COT/26 A 120676, IFU 1 2010 0097 2809). Feu vert de la direction pour
   que les factures, les lettres, le cachet et les mentions du site portent
   CE registre, puis la précision : « juste Maison MND ». Ce harnais tient la
   RÈGLE, pas le cas du jour :
     A. la Maison se nomme seule : son registre, aucun nom de personne ;
     B. la migration ne remplace qu'une raison ACIA 1 connue, rien d'autre ;
     C. ACIA 1 reste intacte : son en-tête, ses tampons, l'ancien cachet ;
     D. l'employeur ne bouge pas, ni les documents d'avant la bascule ;
     E. ce qui attend une décision (le marchand Mobile Money) ne bouge pas.

   Relecture du 10 octobre (11 constats) : la fiche JSON-LD qui nomme des
   personnes ne porte pas le registre ; la phrase du registre est juste et
   ne se retouche pas ; une lettre de Maison MND ne fige jamais les numéros
   d'ACIA 1, même avant la migration ; les pièces d'employeur suivent
   l'employeur ; un document d'avant la bascule se réimprime au caractère
   près, et son PDF sans ligne légale ; le pied du PDF ne répète pas le nom ;
   payer.html se lit commentaires ôtés.

   LES ATTENDUS SONT ÉCRITS EN DUR, jamais lus dans le code éprouvé : un
   harnais qui tire son attente du registre s'accorderait avec n'importe
   quel registre. Les sources se lisent commentaires ôtés. La sortie est en
   ASCII (console Windows). */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  corrigeLaRaisonACIA, DEFAULT_IDENTITY, houseIdentityStore, maisonEmployeur, maisonRaisonAu, maisonRaisonDuPdfAu, migreLaRaisonDeLaMaison, migreLIdentite,
  type HouseIdentity,
} from '../src/shared/identite';
import { ACIA, corrigeLesMentionsMND, enTeteDe } from '../src/shared/secretariat-pur';
import { mentionsDuJour } from '../src/shared/secretariat';
import { morceauxDuCachet, TAMPONS } from '../src/shared/secretariat-tampons';
import { COMMUN, PAGES, remetsLaPhraseDuRegistre } from '../src/apps/revelateur/contenu';
import { appliqueLesRetouches } from '../src/shared/site-retouches';
import { entiteDeLaPiece, PIECES_D_EMPLOYEUR } from '../src/shared/secretariat-modeles';
import { ligneLegaleSousLeNom } from '../src/shared/registre';
import { entreLesParties } from '../src/shared/contrats';
import { exemplaireDe, type AccordImage } from '../src/shared/droit-image';

/* LA FAUTE REMISE, EN MÉMOIRE SEULEMENT. Le lanceur (`--prouve`) passe une
   faute à la fois ; elle s'applique aux sources que ce harnais LIT, comme
   le greffon d'esbuild l'applique à celles qu'il EMPAQUETTE. Rien n'est
   jamais écrit dans le dépôt : une autre session peut y travailler. */
declare const __FAUTE__: { fichier: string; avant?: string; apres?: string; octet?: number }[];
const fautes = typeof __FAUTE__ === 'undefined' ? [] : __FAUTE__;
const racine = process.cwd();
const brut = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  for (const f of fautes) if (f.fichier === rel && f.avant !== undefined) s = s.split(f.avant).join(f.apres ?? '');
  return s;
};
const octets = (rel: string): Buffer => {
  const b = Buffer.from(readFileSync(path.join(racine, rel)));
  for (const f of fautes) if (f.fichier === rel && f.octet !== undefined) b[f.octet] ^= 0xff;
  return b;
};
const sansCommentaires = (rel: string): string =>
  brut(rel).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/^[ \t]*\/\/.*$/gm, '');
/* Une page HTML : ses commentaires <!-- -->, puis ceux de ses styles et
   scripts. Rien ne se cherche dans un commentaire (relecture du 10 octobre). */
const htmlSansCommentaires = (rel: string): string =>
  brut(rel).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const md5 = (rel: string): string => createHash('md5').update(octets(rel)).digest('hex');

/* La console Windows lit en cp1252 : tout ce qui s'affiche passe en ASCII. */
const ascii = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/«\s*/g, '"').replace(/\s*»/g, '"').replace(/·/g, '.').replace(/…/g, '...').replace(/[’‘]/g, "'").replace(/[^\x20-\x7e\n]/g, '?');
let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`));
};

const NOUVELLE = 'Maison MND · RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809';
const ANCIENNE = 'ACIA 1 · RCCM RB/COT/12 A 14509';
/* Aucun nom de personne, rien d'ACIA 1, dans l'identité de Maison MND. */
const PERSONNE_OU_ACIA = /Ahouansou|Y[ée]man|Brice|exploitant|\bETS\b|ACIA|14509|0054\s*8614/i;

/* ══ A. LA MAISON SE NOMME SEULE ══════════════════════════════════════ */
dit('A. la raison par defaut est le registre de la Maison', NOUVELLE, DEFAULT_IDENTITY.raison);
dit('A. elle se decoupe en nom, RCCM, IFU', ['Maison MND', 'RCCM RB/COT/26 A 120676', 'IFU 1 2010 0097 2809'],
  DEFAULT_IDENTITY.raison.split('·').map((m) => m.trim()));
dit('A. le cachet construit depuis elle lit RCCM et IFU', 'RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809',
  morceauxDuCachet(`${DEFAULT_IDENTITY.raison.split('·').slice(1).join('·')} · Quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin`, '+229 01 51 99 77 99').legales);
const enTeteMND = enTeteDe('mnd', { nomMaison: 'Maison MND', mentions: { rccm: 'RB/COT/26 A 120676', ifu: '1 2010 0097 2809' } });
dit('A. l en-tete de Maison MND porte son registre au pied', 'RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809', enTeteMND.pied[1]);
dit('A. une lettre de Maison MND sans mentions tapees prend le registre', { rccm: 'RB/COT/26 A 120676', ifu: '1 2010 0097 2809' }, mentionsDuJour([], 'mnd'));
dit('A. un champ tape reste tel quel', { rccm: 'RB/COT/26 A 120676', ifu: '9999999999999' },
  mentionsDuJour([{ id: 'mentions-mnd', genre: 'mentions', branchId: 'b', entite: 'mnd', rccm: '', ifu: '9999999999999' }], 'mnd'));
dit('A. une ligne MND restee aux numeros d ACIA 1 imprime deja le registre (avant toute migration)', { rccm: 'RB/COT/26 A 120676', ifu: '1 2010 0097 2809' },
  mentionsDuJour([{ id: 'mentions-mnd', genre: 'mentions', branchId: 'b', entite: 'mnd', rccm: 'RB/COT/12 A 14509', ifu: '3 2012 0054 8614' }], 'mnd'));
dit('A. la ligne d ACIA 1, elle, se lit telle quelle', { rccm: 'RB/COT/12 A 14509', ifu: '3 2012 0054 8614' },
  mentionsDuJour([{ id: 'mentions-acia', genre: 'mentions', branchId: 'b', entite: 'acia', rccm: 'RB/COT/12 A 14509', ifu: '3 2012 0054 8614' }], 'acia'));
dit('A. la signature fige les mentions du jour, corrigees', true,
  sansCommentaires('src/shared/secretariat.ts').includes("const m = p.entite === 'mnd' || p.entite === 'acia' ? mentionsDuJour(toutes, p.entite) : undefined;"));
dit('A. le site : nom, RCCM, IFU du registre', ['Maison MND', 'RB/COT/26 A 120676', '1 2010 0097 2809', 'entreprise individuelle'],
  [COMMUN.editeur.nomCommercial, COMMUN.editeur.rccm, (COMMUN.editeur as { ifu?: string }).ifu, COMMUN.editeur.forme]);
dit('A. le site n a plus de champ pour une exploitante', false, 'exploitante' in COMMUN.editeur);
dit('A. l adresse publique ne change pas', 'Ilot 130-F, quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin', COMMUN.editeur.adresse);

/* Les deux paragraphes du site, cherchés par leur titre dans les pages. */
const blocs: { titre?: string; corps?: string }[] = [];
const fouille = (x: unknown) => {
  if (Array.isArray(x)) { x.forEach(fouille); return; }
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.titre === 'string' && typeof o.corps === 'string') blocs.push(o as { titre: string; corps: string });
    Object.values(o).forEach(fouille);
  }
};
fouille(PAGES);
const paragraphe = (titre: string) => blocs.find((b) => b.titre === titre)?.corps ?? '';
const PHRASE = 'Maison MND est une entreprise individuelle immatriculée au registre du commerce et du crédit mobilier de Cotonou sous le numéro RB/COT/26 A 120676, IFU 1 2010 0097 2809. « Maison MND » en est à la fois l’enseigne et le nom commercial. Établissement principal : Ilot 130-F, quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin. Téléphone et WhatsApp : +229 01 51 99 77 99. Courriel : contact@maisonmnd.com.';
dit('A. « Qui est la Maison MND » dit le registre, mot pour mot', PHRASE, paragraphe('Qui est la Maison MND'));
dit('A. « Qui signe ce site » aussi', PHRASE, paragraphe('Qui signe ce site'));
dit('A. les deux paragraphes du registre sont marques', 2,
  PAGES.flatMap((p) => p.sections ?? []).filter((s) => s.type === 'texte' && (s as { cle?: string }).cle === 'registre').length);
/* Une retouche publiée par le Trône (l'ancienne phrase, avec un nom) :
   appliquée comme le fait le générateur, puis la phrase remise. */
{
  const copie = JSON.parse(JSON.stringify(PAGES)) as typeof PAGES;
  const page = copie.find((p) => (p.sections ?? []).some((s) => (s as { cle?: string }).cle === 'registre'));
  const i = (page?.sections ?? []).findIndex((s) => (s as { cle?: string }).cle === 'registre');
  const retouche = 'Maison MND est le nom commercial sous lequel exerce ACIA 1, entreprise individuelle de Prénom Nom.';
  appliqueLesRetouches(copie, undefined, { pages: { [page?.chemin ?? '?']: { [`sections.${i}.corps`]: retouche } } });
  const retouchee = (copie.find((p) => p.chemin === page?.chemin)?.sections?.[i] as { corps?: string })?.corps;
  const remis = remetsLaPhraseDuRegistre(copie);
  const apres = (copie.find((p) => p.chemin === page?.chemin)?.sections?.[i] as { corps?: string })?.corps;
  dit('A. une retouche du registre est remise a la phrase apres les retouches', [retouche, 1, PHRASE], [retouchee, remis, apres]);
}
dit('A. le generateur remet la phrase APRES les retouches', true,
  /contenu\.appliqueLesRetouches\(PAGES, ACCUEIL, [^)]*\);[\s\S]{0,300}contenu\.remetsLaPhraseDuRegistre\(PAGES\)/.test(sansCommentaires('scripts/genere-revelateur.mjs')));

/* Les mentions légales, lues dans le générateur, de leur chemin à la fin de l'objet. */
const generateur = sansCommentaires('scripts/genere-revelateur.mjs');
const debut = generateur.indexOf("chemin: '/mentions-legales/'");
const mentions = debut < 0 ? '' : generateur.slice(debut, generateur.indexOf('` },', debut) + 4);
dit('A. les mentions legales se trouvent et nomment l editeur', [true, true, true, true], [
  mentions.includes('<b>Éditeur.</b> Ce site est édité par ${echappe(COMMUN.editeur.nomCommercial)}'),
  mentions.includes('sous le n° ${echappe(COMMUN.editeur.rccm)}, IFU ${echappe(COMMUN.editeur.ifu)}'),
  mentions.includes('<b>Direction de la publication.</b> La direction de la ${echappe(COMMUN.nom)}, joignable à ${echappe(COMMUN.editeur.email)}.'),
  mentions.includes('<b>Hébergement.</b>'),
]);
dit('A. la Maison n est pas sa propre enseigne (site et mentions)', [true, false, false], [
  mentions.includes('« ${echappe(COMMUN.editeur.nomCommercial)} » en est à la fois l’enseigne et le nom commercial.'),
  /est à la fois son enseigne/.test(mentions), /est à la fois son enseigne/.test(paragraphe('Qui signe ce site')),
]);
/* LA FICHE JSON-LD DE L'ORGANISATION (relecture du 10 octobre) : un nœud
   qui nomme une personne (fondateurs) ne porte pas le registre, sinon il
   relie l'immatriculation à un nom. La règle, pas le cas : lue sur le nœud
   entier, quel que soit le champ. */
{
  const d = generateur.indexOf('const noeudMaison = () => ({');
  const noeud = d < 0 ? '' : generateur.slice(d, generateur.indexOf('\n});', d));
  const porteLeRegistre = /taxID|identifier|editeur\.(rccm|ifu)|RCCM|IFU/.test(noeud);
  const nommeUnePersonne = /founder|'Person'|Ahouansou|Brice|Y[ée]man/.test(noeud);
  dit('A. le noeud JSON-LD de la Maison se trouve', true, noeud.length > 50);
  dit('A. le noeud JSON-LD qui nomme une personne ne porte ni RCCM ni IFU', false, porteLeRegistre && nommeUnePersonne);
}

dit('A. aucun nom de personne ni rien d ACIA 1 dans l identite de Maison MND', [false, false, false, false, false, false], [
  PERSONNE_OU_ACIA.test(DEFAULT_IDENTITY.raison),
  PERSONNE_OU_ACIA.test(JSON.stringify(enTeteMND)),
  PERSONNE_OU_ACIA.test(JSON.stringify(COMMUN.editeur)),
  PERSONNE_OU_ACIA.test(paragraphe('Qui est la Maison MND')),
  PERSONNE_OU_ACIA.test(paragraphe('Qui signe ce site')),
  PERSONNE_OU_ACIA.test(mentions),
]);
/* Le fichier du cachet : là, un motif ne lit rien ; on le compare à son
   empreinte relue à l'œil le 10 octobre 2026 (nom, adresse, RCCM, IFU,
   téléphone, courriel ; aucun nom de personne). */
dit('A. le cachet du registre est celui qui a ete regarde', '3a6a9327f5595c931f41d7f3c943433a', md5('public/assets/tampons/mnd-cachet-registre.png'));
dit('A. et sa forme est reportee au tampon', 600 / 278, TAMPONS.mnd.find((t) => t.cle === 'mnd-cachet-registre')?.ratio);

/* ══ B. LA MIGRATION NE TOUCHE QUE L'ACIA 1 ═══════════════════════════ */
for (const v of [ANCIENNE, 'ACIA1 · RCCM RB/COT/12 A 14509', '  acia 1 ·  rccm  rb/cot/12 a 14509 ', 'ACIA 1', 'Ets ACIA1',
  'ACIA 1 · RCCM RB/COT/12 A 14509 · IFU 3 2012 0054 8614']) {
  dit(`B. « ${v.trim()} » se corrige`, NOUVELLE, corrigeLaRaisonACIA(v));
}
for (const v of [NOUVELLE, 'MND SARL', 'ACIA 10', 'ACIA 1 Group', 'ACIA 1 · RCCM RB/COT/12 A 99999', 'Ma raison a moi', '', null, undefined]) {
  dit(`B. « ${String(v)} » reste`, null, corrigeLaRaisonACIA(v));
}
const fiche: HouseIdentity = { ...DEFAULT_IDENTITY, raison: ANCIENNE, employeur: undefined };
dit('B. la raison migree, l employeur garde l ancienne a la lettre', [NOUVELLE, ANCIENNE],
  (() => { const m = migreLIdentite(fiche); return [m?.raison, m?.employeur]; })());
dit('B. un employeur deja pose est garde', 'NYM SARL', migreLIdentite({ ...fiche, employeur: 'NYM SARL' })?.employeur);
const VARIANTE = 'Ets ACIA1 · RCCM RB/COT/12 A 14509 · IFU 3 2012 0054 8614';
dit('B. la raison remplacee est gardee a la lettre pour les documents d avant', VARIANTE, migreLIdentite({ ...fiche, raison: VARIANTE })?.raisonAvant);
dit('B. une raison d avant deja gardee ne se reecrit pas', 'ACIA 1', migreLIdentite({ ...fiche, raisonAvant: 'ACIA 1' })?.raisonAvant);
dit('B. une raison qui n est pas ACIA 1 ne migre pas', null, migreLIdentite({ ...fiche, raison: 'MND SARL' }));
const m = (entite: string, rccm: string, ifu: string) => corrigeLesMentionsMND({ entite, rccm, ifu });
dit('B. mentions MND aux numeros d ACIA 1 : les deux se corrigent', { rccm: 'RB/COT/26 A 120676', ifu: '1 2010 0097 2809' }, m('mnd', 'RB/COT/12 A 14509', '3 2012 0054 8614'));
dit('B. RCCM d ACIA 1 colle, IFU tape autrement : seul le RCCM change', { rccm: 'RB/COT/26 A 120676', ifu: '9999999999999' }, m('mnd', 'RB/COT/12A14509', '9999999999999'));
dit('B. le RCCM d ACIA 1 precede de « RCCM n° » se reconnait', { rccm: 'RB/COT/26 A 120676', ifu: '' }, m('mnd', 'RCCM n° RB/COT/12 A 14509', ''));
dit('B. des mentions vides ne se creent pas', null, m('mnd', '', ''));
dit('B. des mentions deja justes ne bougent pas', null, m('mnd', 'RB/COT/26 A 120676', '1 2010 0097 2809'));
dit('B. la ligne d ACIA 1 n est jamais une entree', null, m('acia', 'RB/COT/12 A 14509', '3 2012 0054 8614'));

const identite = sansCommentaires('src/shared/identite.ts');
const secretariat = sansCommentaires('src/shared/secretariat.ts');
dit('B. les deux migrations existent', [true, true],
  [/export function migreLaRaisonDeLaMaison\(\)/.test(identite), /export function migreLesMentionsDeLaMaison\(\)/.test(secretariat)]);
dit('B. aucune ne part au chargement du module', [false, false],
  [/^\s*migreLaRaisonDeLaMaison\(\);?\s*$/m.test(identite), /^\s*migreLesMentionsDeLaMaison\(\);?\s*$/m.test(secretariat)]);
dit('B. toutes deux expirent au 31 decembre 2026', [true, true],
  [identite.includes("Date.parse('2026-12-31T23:59:59+01:00')"), secretariat.includes("Date.parse('2026-12-31T23:59:59+01:00')")]);
dit('B. le Trone migre la raison au demarrage', true, /^migreLaRaisonDeLaMaison\(\);$/m.test(sansCommentaires('src/apps/trone/main.tsx')));
dit('B. les mentions se corrigent a l ouverture du Secretariat, par la direction', true,
  sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx').includes('useEffect(() => { if (direction) migreLesMentionsDeLaMaison(); }, [direction]);'));
for (const app of ['couronne', 'revelateur', 'lokaa', 'academie', 'consultation', 'certificat']) {
  let src = '';
  for (const f of ['main.tsx', 'main.ts']) if (existsSync(path.join(racine, `src/apps/${app}/${f}`))) src += sansCommentaires(`src/apps/${app}/${f}`);
  dit(`B. ${app} ne migre rien`, false, /migreLaRaisonDeLaMaison|migreLesMentionsDeLaMaison/.test(src));
}

/* ══ C. ACIA 1 INTACTE ════════════════════════════════════════════════ */
const enTeteACIA = enTeteDe('acia', { nomMaison: 'Maison MND' });
dit('C. l en-tete d ACIA 1 : son nom, son RCCM, rien de Maison MND hors du courriel', ['ACIA 1', 'RCCM RB/COT/12 A 14509', false],
  [enTeteACIA.nom, enTeteACIA.lignes[0], /Maison|MND/.test(JSON.stringify({ ...enTeteACIA, lignes: enTeteACIA.lignes.map((l) => l.replace('direction@maisonmnd.com', '')) }))]);
dit('C. le RCCM connu d ACIA 1', 'RB/COT/12 A 14509', ACIA.rccm);
dit('C. les tampons d ACIA 1', ['acia-sceau', 'acia-cachet'], TAMPONS.acia.map((t) => t.cle));
dit('C. les images n ont pas bouge (cachet ACIA 1, sceau ACIA 1, ancien cachet de la Maison)',
  ['6dc3af3f4a99216a5620e7237130908c', 'd79196f19efd141c3ca41034e7230c89', '1d03cb1b8749f19a3ec5857d02cba63b'],
  ['acia-cachet.png', 'acia-sceau.png', 'mnd-3-cachet.png'].map((f) => md5(`public/assets/tampons/${f}`)));
dit('C. Maison MND garde l ancien cachet et gagne celui du registre', [true, true, true], [
  TAMPONS.mnd.some((t) => t.cle === 'mnd-3-cachet' && t.fichier === 'mnd-3-cachet.png'),
  TAMPONS.mnd.some((t) => t.cle === 'mnd-cachet-registre' && t.fichier === 'mnd-cachet-registre.png'),
  existsSync(path.join(racine, 'public/assets/tampons/mnd-cachet-registre.png')),
]);

/* ══ D. L'EMPLOYEUR, ET LES DOCUMENTS D'AVANT ═════════════════════════ */
dit('D. l employeur par defaut reste ACIA 1', ANCIENNE, maisonEmployeur());
houseIdentityStore.set({ ...DEFAULT_IDENTITY, employeur: undefined });
dit('D. une fiche sans employeur dit ACIA 1', ANCIENNE, maisonEmployeur());
houseIdentityStore.set({ ...DEFAULT_IDENTITY });
for (const rel of ['src/apps/trone/routes/equipe/Personnel.tsx', 'src/apps/trone/routes/finances/Prets.tsx', 'src/apps/trone/routes/finances/lettres-du-pret.ts']) {
  const s = sansCommentaires(rel);
  dit(`D. ${path.basename(rel)} nomme l employeur, pas la raison`, [true, false], [s.includes('maisonEmployeur()'), s.includes('maisonRaison(')]);
}
dit('D. une piece d avant la bascule garde ACIA 1, celles d apres le registre', [ANCIENNE, NOUVELLE, NOUVELLE],
  [maisonRaisonAu('2026-10-09'), maisonRaisonAu('2026-10-10'), maisonRaisonAu('2026-10-12T09:00:00Z')]);
houseIdentityStore.set({ ...DEFAULT_IDENTITY, raisonAvant: VARIANTE });
dit('D. avant la bascule, la raison d alors a la lettre (une variante gardee par la migration)', VARIANTE, maisonRaisonAu('2026-10-09'));
houseIdentityStore.set({ ...DEFAULT_IDENTITY, raison: 'MND SARL' });
dit('D. une raison jamais migree etait deja la avant : elle reste celle d avant', 'MND SARL', maisonRaisonAu('2026-10-09'));
houseIdentityStore.set({ ...DEFAULT_IDENTITY });
dit('D. le PDF d avant la bascule n avait pas de ligne legale, celui d apres le registre', [undefined, NOUVELLE].map(String),
  [maisonRaisonDuPdfAu('2026-10-09'), maisonRaisonDuPdfAu('2026-10-10')].map(String));
const factures = sansCommentaires('src/apps/trone/routes/vente/Factures.tsx');
dit('D. la facture : l ecran dit la raison de son jour, le PDF la ligne de son jour', [true, true, false, false],
  [factures.includes('{maisonRaisonAu(active.date)}'), factures.includes('legal: maisonRaisonDuPdfAu(d.date),'), factures.includes('legal: maisonRaisonAu('), factures.includes('maisonRaison()')]);
dit('D. le recu-facture de la caisse aussi', true, sansCommentaires('src/apps/trone/routes/vente/Caisse.tsx').includes('legal: maisonRaisonDuPdfAu(inv.date),'));
dit('D. sous un pied qui nomme deja la Maison, la ligne legale ne la renomme pas', ['RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809', ANCIENNE],
  [ligneLegaleSousLeNom(NOUVELLE, 'Maison MND'), ligneLegaleSousLeNom(ANCIENNE, 'Maison MND')]);
dit('D. le PDF de facture pose la ligne legale juste au-dessus de la devise', true,
  /if \(d\.legal\?\.trim\(\)\) \{[\s\S]{0,200}doc\.text\(pdfSafe\(ligneLegaleSousLeNom\(d\.legal, maisonNom\(\)\)\), W \/ 2, 280\.5, \{ align: 'center' \}\);\s*\}\s*await pieDeLaMaison\(doc, W, 285\);/
    .test(sansCommentaires('src/shared/pdf.ts')));
dit('D. « Entre … » ne repete pas le nom de la Maison',
  'Entre Maison MND (RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809), dont le siège est à Cotonou, ci-après « la Maison »,',
  entreLesParties({ maison: 'Maison MND', raison: NOUVELLE, ville: 'Cotonou', autre: 'X', qualiteAutre: 'y' })[0]);
dit('D. avec la raison d ACIA 1, la phrase d avant, a la lettre',
  'Entre Maison MND (ACIA 1 · RCCM RB/COT/12 A 14509), dont le siège est à Cotonou, ci-après « la Maison »,',
  entreLesParties({ maison: 'Maison MND', raison: ANCIENNE, ville: 'Cotonou', autre: 'X', qualiteAutre: 'y' })[0]);
const accord = (at: string): AccordImage => ({ at, usages: [], signePar: 'Cliente A.', signature: '', version: 'v2' } as unknown as AccordImage);
dit('D. un droit a l image signe avant la bascule se reimprime avec ACIA 1, apres avec le registre', [
  'Entre Maison MND (ACIA 1 · RCCM RB/COT/12 A 14509), ci-après « la Maison »,',
  'Entre Maison MND (RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809), ci-après « la Maison »,',
], [
  exemplaireDe(accord('2026-10-01'), { maison: 'Maison MND', raison: NOUVELLE, tete: 'Cliente A.' }).entete[0],
  exemplaireDe(accord('2026-10-12'), { maison: 'Maison MND', raison: NOUVELLE, tete: 'Cliente A.' }).entete[0],
]);

dit('D. un droit a l image d avant se reimprime avec la raison d alors, a la lettre', `Entre Maison MND (${VARIANTE}), ci-après « la Maison »,`,
  (() => { houseIdentityStore.set({ ...DEFAULT_IDENTITY, raisonAvant: VARIANTE }); const e = exemplaireDe(accord('2026-10-01'), { maison: 'Maison MND', raison: NOUVELLE, tete: 'Cliente A.' }).entete[0]; houseIdentityStore.set({ ...DEFAULT_IDENTITY }); return e; })());

/* LES PIÈCES D'EMPLOYEUR DU SECRÉTARIAT (relecture du 10 octobre) : au nom
   de l'employeur réglé, pas au nom choisi, tant que l'employeur est ACIA 1. */
dit('D. la liste des pieces d employeur', ['convocation-entretien', 'avertissement', 'felicitations', 'certificat-fin-contrat', 'acceptation-demission', 'attestation-travail', 'contrat-travail'],
  [...PIECES_D_EMPLOYEUR]);
dit('D. une piece d employeur demandee sous Maison MND se fait au nom d ACIA 1, employeur', ['acia', 'acia', 'acia', 'mnd', 'mnd', 'acia', 'autre', 'mnd', 'perso'], [
  entiteDeLaPiece('mnd', 'attestation-travail', ANCIENNE),
  entiteDeLaPiece('mnd', 'contrat-travail', 'ACIA1 · RCCM RB/COT/12 A 14509'),
  entiteDeLaPiece('mnd', 'certificat-fin-contrat', 'Ets ACIA1'),
  entiteDeLaPiece('mnd', 'attestation-travail', NOUVELLE),
  entiteDeLaPiece('mnd', 'attestation-stage', ANCIENNE),
  entiteDeLaPiece('acia', 'contrat-travail', NOUVELLE),
  entiteDeLaPiece('autre', 'contrat-travail', ANCIENNE),
  entiteDeLaPiece('mnd', 'attestation-travail', 'ACIA 10'),
  entiteDeLaPiece('perso', 'attestation-travail', ANCIENNE),
]);
{
  const ecran = sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx');
  dit('D. l ecran cree la piece au nom de l employeur', [true, true],
    [ecran.includes('const auNomDe = entiteDeLaPiece(entite, modele, maisonEmployeur());'), /nouvellePiece\(\{ branchId, entite: auNomDe,/.test(ecran)]);
}
dit('D. les ecrans de l identite ne disent pas « societe » (entreprise individuelle)', [false, false],
  ['src/apps/trone/routes/systeme/Textes.tsx', 'src/apps/trone/routes/systeme/Parametres.tsx'].map((f) => /soci[ée]t[ée]/i.test(sansCommentaires(f))));

/* ══ E. CE QUI ATTEND UNE DÉCISION ═══════════════════════════════════ */
dit('E. le marchand Mobile Money garde son nom chez l operateur', [true, true, true], [
  sansCommentaires('src/apps/trone/routes/equipe/data.ts').includes("export const MOMO_MARCHAND_DEFAUT = 'Ets ACIA1';"),
  htmlSansCommentaires('public/payer.html').includes('<b id="nomMarchand">ACIA1</b>')
    && htmlSansCommentaires('public/payer.html').includes("textContent = marchand || 'ACIA1';"),
  sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx').includes('>ACIA1</div>'),
]);

/* ══ LA MIGRATION, DE BOUT EN BOUT ════════════════════════════════════
   Une fiche stockée qui dit encore ACIA 1, sans employeur : après le
   démarrage du Trône, la raison est le registre, l'employeur l'ancienne, et
   le poste est marqué. Remettre ACIA 1 ensuite ne rejoue rien. (Sans
   serveur, la descente rend la main après sa ceinture de cinq secondes.) */
houseIdentityStore.set({ ...DEFAULT_IDENTITY, raison: ANCIENNE, employeur: undefined });
migreLaRaisonDeLaMaison();
await new Promise((r) => setTimeout(r, 5600));
const apres = houseIdentityStore.get();
dit('B. au demarrage, la fiche ACIA 1 passe au registre, l employeur garde ACIA 1', [NOUVELLE, ANCIENNE, true],
  [apres.raison, apres.employeur, !!localStorage.getItem('mnd_raison_maison_2026_10')]);
houseIdentityStore.set({ ...DEFAULT_IDENTITY, raison: ANCIENNE });
migreLaRaisonDeLaMaison();
await new Promise((r) => setTimeout(r, 300));
dit('B. une fois marque, le poste ne rejoue plus la migration', ANCIENNE, houseIdentityStore.get().raison);

console.log(ko === 0 ? '\nL identite de la Maison tient.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
