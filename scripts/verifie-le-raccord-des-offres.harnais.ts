/* LE RACCORD DES OFFRES, ÉPROUVÉ — `node scripts/verifie-le-raccord-des-offres.mjs`.

   TROIS FOIS DANS LA MÊME JOURNÉE, le 24 septembre 2026, le défaut n'était
   dans aucune des deux pièces mais dans leur RACCORD. Un pourcentage à
   décimale lu de travers entre le générateur de codes et la résolution du
   serveur. Un cadeau pris pour un code sans effet, entre les offres de
   parcours écrites d'un côté et la note écrite de l'autre. Chaque harnais
   tenait sa rive, et aucun ne voyait la couture, parce qu'un harnais éprouve
   ce qu'il connaît. Une QUATRIÈME fois, le raccord était entre ce banc et ce
   qu'il prétendait mesurer : l'attente se lisait sur la couverture de l'offre,
   donc sur le code même qu'on éprouve, et une offre vidée de ses prestations
   emportait l'attente avec elle. Un banc qui demande au code la réponse qu'il
   devrait avoir s'accorde toujours (le-trone-35, qui l'a éprouvé au lieu de
   me croire).

   Celui-ci n'éprouve QUE la couture, et il la prend au plus large : les
   douze offres réellement écrites dans le dépôt, sept saisons et cinq
   parcours, montées par la FONCTION DU TRÔNE qui les pose (`offreDepuisLaSaison`),
   puis données à la RÉSOLUTION DE LA FONCTION EDGE, extraite de son fichier
   tel qu'il sera déployé. Ni l'une ni l'autre n'est réécrite ici.

   Ce qu'il refuse : une offre de la Maison que le serveur ne retrouve pas
   par son code, un pourcentage qui ne retire rien là où il devrait, un
   cadeau annoncé à l'accueil comme un code sans effet. Une nouvelle saison
   qui entre dans le dépôt passe par ici sans que personne y pense. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OFFRES_DE_PARCOURS, SAISONS, codeNormalise, offreDepuisLaSaison } from '../src/shared/offers';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── La résolution du serveur, telle qu'elle sera déployée ────────── */
const src = readFileSync(path.join(process.cwd(), 'supabase/functions/demande-submit/index.ts'), 'utf8');
const bloc = src.slice(src.indexOf('/* ══ COPIE DE offres-pur : DÉBUT ══ */'), src.indexOf('/* ══ COPIE DE offres-pur : FIN ══ */'));
const blocR = src.slice(src.indexOf('/* ══ RÉSOLUTION DU CODE : DÉBUT ══ */'), src.indexOf('/* ══ RÉSOLUTION DU CODE : FIN ══ */'));
dit('les deux blocs du serveur se lisent', true, bloc.length > 200 && blocR.length > 200);
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
const { code: js } = await transform(`${bloc}${blocR}\nexport { remiseDuCode, raisonEnClair };`, { loader: 'ts', format: 'esm' });
const banc = mkdtempSync(path.join(os.tmpdir(), 'raccord-'));
const fichier = path.join(banc, 'serveur.mjs');
writeFileSync(fichier, js);
type Verdict = { code: string; offreId?: string; remisesLignes?: ({ pct: number } | null)[]; raison?: string };
let serveur: { remiseDuCode: (o: any) => Verdict; raisonEnClair: (v: any) => string };
try {
  serveur = await import(pathToFileURL(fichier).href);
} finally {
  rmSync(banc, { recursive: true, force: true });
}

/* ── Un catalogue de circonstance, une prestation par famille citée ─
   Les identifiants de familles sont ceux qu'écrivent les saisons ; s'ils
   changent sans que ce banc suive, les offres ne couvriront plus rien et
   c'est précisément ce que le harnais doit crier. */
const FAMILLES = ['cat-lavages', 'tn29axgoc5', 'cat-soins', 'cat-styling', 'koko', 'cat-mnd-kids', 'aca-pro'];
const catalogue = FAMILLES.map((c, i) => ({ id: `svc-${i}`, categoryId: c }));
const prix = Object.fromEntries(catalogue.map((s) => [s.id, { id: s.id, data: { priceXof: 12000 + 1000 * Number(s.id.slice(4)), priceMode: 'fixe' } }]));
const catalogueDuServeur = Object.values(prix);
const BR = 'br-maison';
const TOUTES = [...SAISONS, ...OFFRES_DE_PARCOURS];

dit('les douze offres de la Maison sont au banc', 12, TOUTES.length);
dit('... et chacune porte un code', [], TOUTES.filter((s) => !s.code).map((s) => s.nom));
/* LA LISTE DES FAMILLES N'A PLUS DE GARDIEN, elle a une vérification : une
   famille renommée dans le catalogue sans que ce banc suive viderait les
   offres, et un banc qui ne couvre rien n'éprouve rien. */
const CITEES = [...new Set(TOUTES.flatMap((s) => s.categories ?? []))];
dit('chaque famille citée par les offres existe au banc', [], CITEES.filter((c) => !FAMILLES.includes(c)));
dit('... et le banc ne porte aucune famille que personne ne cite', [], FAMILLES.filter((c) => !CITEES.includes(c)));

for (const s of TOUTES) {
  /* LA MÊME FONCTION QUE LE TRÔNE, et pas une imitation : c'est elle qui
     résout les familles en prestations et pose le code et la remise. */
  const offre = offreDepuisLaSaison(s, { du: '', au: '' }, BR, `off-${s.cle}`, catalogue, []);
  const choisies = offre.serviceIds ?? [];
  /* AUCUN REPLI ICI, et c'est réfléchi : interroger le serveur sur une
     prestation que l'offre ne couvre pas mesurerait un autre scénario que
     celui qu'on croit lire, et le banc se tairait au moment où il devrait
     crier (le-trone-35, 24 septembre). Sans couverture, la demande part
     vide, la remise ne peut pas porter, et l'attente ci-dessous échoue. */
  const v = serveur.remiseDuCode({
    code: offre.code, serviceIds: choisies,
    branchId: BR, catalogue: catalogueDuServeur, offres: [offre],
  });

  dit(`${s.code} · le serveur retrouve l offre de la Maison`, `off-${s.cle}`, v.offreId);
  dit(`${s.code} · le code voyage dans la forme que le serveur cherche`, codeNormalise(offre.code), v.code);
  /* UNE OFFRE QUI DÉCLARE DES FAMILLES DOIT COUVRIR QUELQUE CHOSE. Sans
     cette ligne, une famille renommée dans le catalogue vidait l'offre en
     silence, et tout le reste du banc s'accordait à ce vide. */
  if (s.categories?.length) {
    dit(`${s.code} · ses familles résolvent au moins une prestation`, true, choisies.length > 0);
  }

  /* L'ATTENTE NE SE DÉDUIT PLUS DE CE QU'ON MESURE — 24 septembre 2026.
     Elle se lisait sur `choisies`, c'est-à-dire sur le code même qu'on
     éprouve : quand la couverture tombait à zéro, l'attente tombait avec
     elle et le banc se félicitait. Un pourcentage annoncé DOIT retirer,
     sans condition ; la ligne du dessus répond du reste. */
  const attendu = !s.remise ? 'cadeau' : 'remise';
  const obtenu = v.remisesLignes ? 'remise' : (v.raison ?? 'rien');
  dit(`${s.code} · ${!s.remise ? 'cadeau' : `−${s.remise} %`} donne ce qu il annonce`, attendu, obtenu);

  if (attendu === 'remise') {
    dit(`${s.code} · la remise porte sur toutes les prestations couvertes, et sur elles seules`,
      choisies.map(() => ({ pct: s.remise })), v.remisesLignes);
  }
  /* La note de l'accueil ne doit jamais dire d'un cadeau qu'il ne porte
     sur rien : c'est ce qui ferait refuser au comptoir ce que la carte
     a promis. */
  const note = serveur.raisonEnClair(v);
  dit(`${s.code} · la note de l accueil ne renie pas la carte`, false,
    !s.remise && note.includes('ne porte sur aucun geste'));
}

console.log(ko === 0 ? '\nLe raccord tient : les douze offres se resolvent comme elles se promettent.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
