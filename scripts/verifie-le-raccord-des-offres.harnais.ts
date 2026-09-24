/* LE RACCORD DES OFFRES, ÉPROUVÉ — `node scripts/verifie-le-raccord-des-offres.mjs`.

   TROIS FOIS DANS LA MÊME JOURNÉE, le 24 septembre 2026, le défaut n'était
   dans aucune des deux pièces mais dans leur RACCORD. Un pourcentage à
   décimale lu de travers entre le générateur de codes et la résolution du
   serveur. Un cadeau pris pour un code sans effet, entre les offres de
   parcours écrites d'un côté et la note écrite de l'autre. Chaque harnais
   tenait sa rive, et aucun ne voyait la couture, parce qu'un harnais éprouve
   ce qu'il connaît.

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

for (const s of TOUTES) {
  /* LA MÊME FONCTION QUE LE TRÔNE, et pas une imitation : c'est elle qui
     résout les familles en prestations et pose le code et la remise. */
  const offre = offreDepuisLaSaison(s, { du: '', au: '' }, BR, `off-${s.cle}`, catalogue, []);
  const choisies = offre.serviceIds ?? [];
  const v = serveur.remiseDuCode({
    code: offre.code, serviceIds: choisies.length ? choisies : [catalogue[0].id],
    branchId: BR, catalogue: catalogueDuServeur, offres: [offre],
  });

  dit(`${s.code} · le serveur retrouve l offre de la Maison`, `off-${s.cle}`, v.offreId);
  dit(`${s.code} · le code voyage dans la forme que le serveur cherche`, codeNormalise(offre.code), v.code);

  /* Une offre à pourcentage QUI COUVRE quelque chose doit retirer ; sans
     pourcentage, c'est un cadeau, et jamais « sans effet ». */
  const attendu = !s.remise ? 'cadeau' : (choisies.length ? 'remise' : 'sans-effet');
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
