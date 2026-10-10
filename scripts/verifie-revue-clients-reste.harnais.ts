/* LA REVUE DU 10 OCTOBRE 2026, LOT « CLIENTS-RESTE », EPROUVEE.
   `node scripts/verifie-revue-clients-reste.mjs` (et `--prouve`).

   Onze constats de la relecture du code, corriges le 10 octobre 2026. Le banc
   porte la REGLE de chacun, pas seulement le cas du jour :

     A. L'IMPRESSION : aucune source du Trone n'ouvre une fenetre vide avec
        'noopener' (window.open rend alors null, la carte ne s'imprimait
        jamais) ; les deux cartes A5 coupent le lien a la main et disent un
        blocage.
     B. LE TAPIS DU SITE dit ce que le serveur accepte (`reservableSurLeSite`,
        `siteMasques` seuls, sans produit), dans l'ordre du catalogue.
     C. LE BILAN : au retour de l'assistant, la note se reprend telle qu'elle
        est, jamais celle lue au clic.
     D. L'EDITEUR DU SITE : publier ne retire du brouillon que ce qui est
        parti, et lit le brouillon apres la confirmation.
     E. LES ANNEES : aucune date « jour + mois » sans l'annee dans les ecrans
        du lot (bilans, carte de marraine, demandes, envois, tableau de bord).
     F. LA MARRAINE : une amie recompensee sous un nom ne l'est pas une
        seconde fois sous l'autre (fiche rattachee, puis demande convertie).
     G. « SALON » : jamais dans un texte des offres ni des parcours.
     H. LES SOURCES DU LOT SE LISENT : chaque fichier touche par le lot
        s'analyse comme du TypeScript, sans une seule erreur de syntaxe.
        Reprise du 10 octobre 2026 : un `sed` sous Git Bash (ou \` est
        l'ancre « debut du tampon ») avait pose un accent grave en tete de
        chacune des lignes de site-retouches.ts. Le fichier ne se compilait
        plus, et tout ce qui l'importe avec lui. La syntaxe se lit ici sur le
        disque, a l'execution : meme quand la construction du banc echoue, le
        banc deja construit dit QUEL fichier est casse.

   Les attentes sont ecrites en dur, jamais tirees du code eprouve. Sortie en
   ASCII (la console Windows est en cp1252). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tapisDuSite } from '../src/apps/trone/routes/clients/tapis-du-site';
import { resteDuBrouillon } from '../src/shared/site-retouches';
import { lignees, recompensesAPoser, type DemandeLue, type FicheAmb, type RdvLu } from '../src/shared/ambassade';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n      attendu ${JSON.stringify(attendu)}\n      obtenu  ${JSON.stringify(obtenu)}`}`);
};
/* Les commentaires s'effacent avant toute lecture : une phrase qui raconte
   l'ancienne faute ne doit ni faire crier ni faire passer le banc. */
const sansCommentaires = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const C = 'src/apps/trone/routes/clients';

/* ── A. L'IMPRESSION ──────────────────────────────────────────────────── */
const sourcesDuTrone: string[] = [];
const parcours = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) parcours(p);
    else if (/\.(ts|tsx)$/.test(n)) sourcesDuTrone.push(p);
  }
};
parcours('src/apps/trone');
const ouverturesVides = sourcesDuTrone.flatMap((f) => (sansCommentaires(f).match(/window\.open\(\s*''\s*,[^)]*\)/g) ?? [])
  .map((o) => `${f.split(path.sep).join('/')}: ${o}`));
dit('A1 aucune fenetre vide du Trone ne s ouvre avec noopener (window.open rendrait null)', [],
  ouverturesVides.filter((o) => /noopener/.test(o)));
dit('A1b ... et le controle en lit bien (au moins trois)', true, ouverturesVides.length >= 3);
const qr = sansCommentaires(`${C}/QrCodes.tsx`);
const vi = sansCommentaires(`${C}/Vitrine.tsx`);
const ouvreEtCoupe = /const fen = window\.open\('', '_blank', 'width=520,height=760'\);\s*if \(!fen\) \{ toast\('[^']+'\); return; \}\s*fen\.opener = null;\s*fen\.document\.write\(/;
dit('A2 la carte A5 des codes dit un blocage et coupe le lien a la main', true, ouvreEtCoupe.test(qr));
dit('A3 la carte de Ma Couronne aussi', true, ouvreEtCoupe.test(vi));

/* ── B. LE TAPIS DU SITE ──────────────────────────────────────────────── */
/* L'arbre dans l'ordre de la regie : la consultation, l'Entretien et une de
   ses familles, la Coloration, la Creation. */
const arbre = [
  { id: 'koko' }, { id: 'atl-ii-gbeji' }, { id: 'gbeji-lav', parentId: 'atl-ii-gbeji' },
  { id: 'atl-iii-yekpe' }, { id: 'atl-i-vekpe' },
];
const svc = (id: string, categoryId: string, order: number, plus: Record<string, unknown> = {}) =>
  ({ id, name: id, categoryId, order, ...plus });
const prestations = [
  svc('s-lav', 'gbeji-lav', 2),
  svc('s-cache-site', 'gbeji-lav', 1),
  svc('s-soin-cache-couronne', 'atl-ii-gbeji', 1),
  svc('s-devis', 'gbeji-lav', 3, { priceMode: 'devis' }),
  svc('s-eteinte', 'gbeji-lav', 4, { enabled: false }),
  svc('s-color', 'atl-iii-yekpe', 1),
  svc('s-koko', 'koko', 1),
  svc('s-crea', 'atl-i-vekpe', 1),
];
/* Ma Couronne masque le soin : le site ne lit pas ce masque. Le site masque
   une prestation et toute la Coloration. */
const masquesDuSite = { services: ['s-cache-site'], categories: ['atl-iii-yekpe'] };
dit('B1 le tapis du site = ce que le serveur accepte, dans l ordre du catalogue',
  ['s-koko', 's-soin-cache-couronne', 's-lav'],
  tapisDuSite(prestations, arbre, masquesDuSite).map((s) => s.name));
dit('B2 sans masque du site, la Coloration revient et la prestation aussi',
  ['s-koko', 's-soin-cache-couronne', 's-cache-site', 's-lav', 's-color'],
  tapisDuSite(prestations, arbre, undefined).map((s) => s.name));
dit('B3 la regie compose le tapis du site par ce juge, sans produit', [true, true], [
  /portee === 'site' \? tapisDuSite\(services, catsDansLOrdre\(categories\), cfg\.siteMasques\) : null/.test(vi),
  /surLeSite\s*\?\s*surLeSite\.map\(\(x\) => x\.name\)\s*:/.test(vi),
]);

/* ── C. LE BILAN DE LA SEANCE ─────────────────────────────────────────── */
const bilan = sansCommentaires(`${C}/LeBilanDeLaSeance.tsx`);
const apresLAssistant = bilan.split("await demande('rediger');")[1]?.split('} catch')[0] ?? '';
dit('C1 au retour de l assistant, la note se reprend telle qu elle est (jamais celle du clic)', [true, false, true], [
  apresLAssistant.length > 0,
  /garde\(\{ \.\.\.note\b/.test(apresLAssistant),
  /garde\(\{ \.\.\.noteVive\.current, brouillon: b/.test(apresLAssistant),
]);
dit('C2 ... et la note vive suit chaque rendu', true, /const noteVive = useRef\(note\);\s*noteVive\.current = note;/.test(bilan));

/* ── D. L'EDITEUR DU SITE ─────────────────────────────────────────────── */
const parti = {
  pages: { '/': { h1: 'Bonjour', 'cta.texte': 'Venez' }, '/entretien/': { ligne: 'Net' } },
  photos: [{ photo: 'a.jpg', page: '/', accordLe: '2026-10-09' }],
};
const pendantLaConfirmation = {
  pages: {
    '/': { h1: 'Bonjour', 'cta.texte': 'Entrez', sur: 'Nouveau' },
    '/entretien/': { ligne: 'Net' },
    '/coloration/': { h1: 'Couleur' },
  },
  photos: [{ photo: 'a.jpg', page: '/', accordLe: '2026-10-09' }, { photo: 'b.jpg', page: '/coloration/', accordLe: '2026-10-10' }],
};
dit('D1 publier ne retire que ce qui est parti, a la meme valeur', {
  pages: { '/': { 'cta.texte': 'Entrez', sur: 'Nouveau' }, '/coloration/': { h1: 'Couleur' } },
  photos: [{ photo: 'b.jpg', page: '/coloration/', accordLe: '2026-10-10' }],
}, resteDuBrouillon(pendantLaConfirmation, parti));
dit('D2 un brouillon publie tel quel se vide entierement', { pages: {} }, resteDuBrouillon(parti, parti));
const ed = sansCommentaires(`${C}/EditeurDuSite.tsx`);
const publier = ed.split('const publier = async () => {')[1]?.split('const revenirAvant')[0] ?? '';
dit('D3 publier lit le brouillon APRES la confirmation et ne le vide plus d un bloc', [true, true, false, true], [
  publier.indexOf('brouillonDuSiteStore.get()') > publier.indexOf('await demande('),
  /publie\(p, parti\.pages \?\? \{\}, .*parti\.photos \?\? \[\]\)\)/.test(publier),
  /brouillonDuSiteStore\.set\(\{ pages: \{\} \}\)/.test(publier),
  /brouillonDuSiteStore\.set\(\(b\) => resteDuBrouillon\(b, parti\)\)/.test(publier),
]);

/* ── E. LES ANNEES ────────────────────────────────────────────────────── */
const ecransDates = ['BilanModal.tsx', 'CarteDeMarrainePanneau.tsx', 'Demandes.tsx', 'EnvoisAutomatiques.tsx', 'SalleDesEnvois.tsx'];
const datesLues = ecransDates.flatMap((f) => (sansCommentaires(`${C}/${f}`).match(/toLocaleDateString\([^{;]*\{[^}]*\}/g) ?? [])
  .map((o) => ({ f, o: o.replace(/\s+/g, ' ') })));
dit('E1 aucun ecran du lot n ecrit une date « jour + mois » sans l annee', [],
  datesLues.filter(({ o }) => /\bday:/.test(o) && /\bmonth:/.test(o) && !/\byear:/.test(o)).map(({ f, o }) => `${f}: ${o}`));
dit('E1b ... et le controle en lit bien (au moins cinq)', true, datesLues.length >= 5);
dit('E2 le registre des bilans n ecrit aucune date par frShort ni frDay', [],
  sansCommentaires(`${C}/BilanModal.tsx`).match(/\b(frShort|frDay)\(/g) ?? []);
const tableau = sansCommentaires('src/apps/trone/routes/pilotage/Dashboard.tsx');
const jjmm = [...tableau.matchAll(/slice\(8, 10\)\}\/\$\{([\w.]+)\.slice\(5, 7\)\}(\/\$\{\1\.slice\(0, 4\)\})?/g)];
dit('E3 le tableau de bord n ecrit aucun jj/mm sans l annee', [], jjmm.filter((m) => !m[2]).map((m) => m[0]));
dit('E3b ... et le controle en lit bien (au moins un jj/mm)', true, jjmm.length >= 1);

/* ── F. LA MARRAINE ───────────────────────────────────────────────────── */
const LANCE = '2026-10-01';
const fiche = (o: Partial<FicheAmb> & { id: string }): FicheAmb => ({ name: 'X', phone: '+2290100000000', since: '2020-01-01', ...o } as FicheAmb);
const marraine = fiche({ id: 'm1', name: 'Ama B.', phone: '+2290170000001', graine: { code: 'AMA-7K2', le: LANCE, atteinteLe: '2026-09-08', seuil: 5 } });
const amie = fiche({ id: 'x1', name: 'Efua T.', phone: '+2290170000002', parraineePar: 'AMA-7K2' });
const rdvs: RdvLu[] = [{ id: 'r1', status: 'honoré', date: '2026-10-05', clientId: 'x1' }];
const reglage = { lanceLe: LANCE, merciParWhatsApp: true, remisePct: 20 };
/* 1er passage : rattachee a la main, venue, la recompense `parr-c-x1` se pose. */
const p1 = recompensesAPoser([marraine, amie], lignees([marraine, amie], [], rdvs), reglage, '2026-10-06');
dit('F1 rattachee a la main et venue : une recompense et un merci', [['parr-c-x1'], 1],
  [(p1.parFiche.get('m1') ?? []).map((s) => s.id), p1.mercis.length]);
const marraineApres = { ...marraine, soinsOfferts: [...(p1.parFiche.get('m1') ?? [])] };
/* 2e passage : sa demande de rappel est convertie vers sa fiche. */
const rappel: DemandeLue = { id: 'dR', prenom: 'Efua', telephone: '+2290170000002', createdAt: '2026-10-02T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'AMA-7K2', clientId: 'x1' };
const p2 = recompensesAPoser([marraineApres, amie], lignees([marraineApres, amie], [rappel], rdvs), reglage, '2026-10-07');
dit('F2 demande de rappel convertie vers la fiche : ni seconde recompense ni second merci', [0, 0], [p2.parFiche.size, p2.mercis.length]);
dit('F3 ... et la demande se marque, ce qui ferme le chemin', ['dR'], p2.demandesMarquees);
/* Variante : le rendez-vous du site, rattache a la meme fiche par la conversion. */
const rdvsSite: RdvLu[] = [...rdvs, { id: 'r2', status: 'honoré', date: '2026-10-05', clientId: 'x1' }];
const resa: DemandeLue = { id: 'dS', prenom: 'Efua', telephone: '+2290170000002', createdAt: '2026-10-02T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'AMA-7K2', apptId: 'r2' };
const p3 = recompensesAPoser([marraineApres, amie], lignees([marraineApres, amie], [resa], rdvsSite), reglage, '2026-10-07');
dit('F4 rendez-vous du site rattache apres coup : ni seconde recompense ni second merci', [0, 0], [p3.parFiche.size, p3.mercis.length]);
/* Le sens normal ne bouge pas : sans recompense deja posee, une seule. */
const p4 = recompensesAPoser([marraine, amie], lignees([marraine, amie], [rappel], rdvs), reglage, '2026-10-07');
dit('F5 sans recompense deja posee, une seule, au nom de la demande', [['parr-dR'], 1, ['dR']],
  [(p4.parFiche.get('m1') ?? []).map((s) => s.id), p4.mercis.length, p4.demandesMarquees]);

/* ── G. « SALON » ─────────────────────────────────────────────────────── */
const litteraux = (f: string) => sansCommentaires(f).match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
const textesLus = ['src/shared/offers.ts', 'src/shared/parcours.ts'].flatMap((f) => litteraux(f).map((t) => ({ f, t })));
dit('G1 aucun texte des offres ni des parcours ne dit « salon »', [],
  textesLus.filter(({ t }) => /\bsalons?\b/i.test(t)).map(({ f, t }) => `${f}: ${t.slice(0, 80)}`));
dit('G2 ... et le controle lit bien les textes (les conditions de la rentree, plus de cinquante)', [true, true], [
  textesLus.some(({ t }) => t.includes('Les prestations dont le prix se dit à la Maison ne sont pas remisées.')),
  textesLus.length > 50,
]);

/* ── H. LES SOURCES DU LOT SE LISENT ──────────────────────────────────── */
/* TypeScript se charge depuis le depot (le banc construit vit dans un dossier
   temporaire, il ne le trouverait pas tout seul). */
const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript') as typeof import('typescript');
const sourcesDuLot = [
  `${C}/QrCodes.tsx`, `${C}/Vitrine.tsx`, `${C}/tapis-du-site.ts`, `${C}/LeBilanDeLaSeance.tsx`,
  `${C}/EditeurDuSite.tsx`, `${C}/BilanModal.tsx`, `${C}/CarteDeMarrainePanneau.tsx`, `${C}/Demandes.tsx`,
  `${C}/EnvoisAutomatiques.tsx`, `${C}/SalleDesEnvois.tsx`, 'src/apps/trone/routes/pilotage/Dashboard.tsx',
  'src/shared/site-retouches.ts', 'src/shared/ambassade.ts', 'src/shared/offers.ts', 'src/shared/parcours.ts',
];
const syntaxe = sourcesDuLot.map((f) => {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true,
    f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diags = (sf as unknown as { parseDiagnostics: { start?: number; messageText: unknown }[] }).parseDiagnostics;
  return { f, n: diags.length, premier: diags[0] ? `${sf.getLineAndCharacterOfPosition(diags[0].start ?? 0).line + 1}: ${String(diags[0].messageText)}` : '' };
});
dit('H1 chaque source du lot s analyse comme du TypeScript, sans erreur de syntaxe', [],
  syntaxe.filter((s) => s.n > 0).map((s) => `${s.f} (${s.n} erreur(s), la premiere ligne ${s.premier})`));
dit('H2 ... et le controle lit bien les quinze sources du lot, chacune non vide', [15, true],
  [syntaxe.length, sourcesDuLot.every((f) => readFileSync(f, 'utf8').length > 200)]);

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} echec(s).`);
if (ko) process.exit(1);
