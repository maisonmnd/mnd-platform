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
import {
  offreDuCode, offreDuCodePassee, remiseDeLOffreSurLeTicket, pourquoiLOffreNeCourtPas,
  remiseDuComptoirAuRendezVous, remiseDeFactureAReporter,
} from '../src/shared/offres-pur';

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

/* LE CODE D'UNE OFFRE A LA CAISSE — 1er octobre 2026. « ROSE15 ne marche pas sur le
   Trone » : la caisse ne connaissait que les codes nominatifs. Elle applique desormais
   l'offre avec la regle du site, sur les seules prestations couvertes. */
{
  const rose = { active: true, du: '2026-10-01', au: '2026-10-31', code: 'ROSE15', discountPct: 15, serviceIds: ['sv-a', 'sv-b'] };
  const rentree = { active: true, du: '2026-09-01', au: '2026-09-30', code: 'RENTREE10', discountPct: 10, serviceIds: ['sv-a'] };
  const dormante = { ...rose, code: 'DORT20', active: false };
  const offres = [rentree, rose, dormante];
  const le5 = new Date('2026-10-05T10:00:00');
  dit('le 5 octobre, ROSE15 designe l offre Octobre Rose', 'ROSE15', offreDuCode(offres, 'rose15', le5)?.code ?? null);
  dit('... tape en minuscules avec un espace, il est reconnu', 'ROSE15', offreDuCode(offres, ' rose 15 ', le5)?.code ?? null);
  const ticket = [{ serviceId: 'sv-a', montantXof: 20000 }, { serviceId: 'sv-b', montantXof: 10000 }, { serviceId: 'sv-hors', montantXof: 50000 }];
  dit('15 % sur les deux prestations couvertes, rien sur la troisieme', { retire: 4500, combien: 2 }, remiseDeLOffreSurLeTicket(rose, ticket));
  dit('un ticket sans prestation couverte ne retire rien', { retire: 0, combien: 0 }, remiseDeLOffreSurLeTicket(rose, [{ serviceId: 'sv-hors', montantXof: 50000 }]));
  dit('sans offre, rien ne bouge', { retire: 0, combien: 0 }, remiseDeLOffreSurLeTicket(null, ticket));
  dit('RENTREE10 ne court plus le 5 octobre', null, offreDuCode(offres, 'RENTREE10', le5));
  dit('... et la caisse le dit avec sa date', 'Ce code a couru jusqu’au 30 septembre.', pourquoiLOffreNeCourtPas(offreDuCodePassee(offres, 'RENTREE10', le5)!, le5));
  dit('ROSE15 tape le 20 septembre : il vaudra a partir du 1er octobre', 'Ce code vaudra à partir du 1er octobre.',
    pourquoiLOffreNeCourtPas(offreDuCodePassee(offres, 'ROSE15', new Date('2026-09-20T10:00:00'))!, new Date('2026-09-20T10:00:00')));
  dit('une offre non activee se dit telle', 'Cette offre existe, mais elle n’est pas activée.', pourquoiLOffreNeCourtPas(offreDuCodePassee(offres, 'DORT20', le5)!, le5));
  dit('un code que personne ne porte reste inconnu', null, offreDuCode(offres, 'INCONNU', le5) ?? offreDuCodePassee(offres, 'INCONNU', le5));
  const caisse = readFileSync('src/apps/trone/routes/vente/Caisse.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('la caisse cherche l offre quand le code n est pas nominatif', true, /offreDuCode\(offresDeLaBranche, codeTape\)/.test(caisse) && /remiseDeLOffreSurLeTicket\(offreCodee, lignesRemisables\)/.test(caisse));
}

/* ── LA REMISE DU COMPTOIR S'ECRIT AU RENDEZ-VOUS (2 octobre 2026) ──
   « La facture est soldee mais quand je reviens dans le rendez-vous depuis le
   Carnet elle reste devoir 12 000 F » (Yeman) : un rituel a 80 000 F, ROSE15,
   68 000 F encaisses. La remise accordee au comptoir est une remise sur le
   rituel ; elle s'ecrit sur lui, bornee par ce qui a ete retire et par ce qui
   restait du. */
{
  dit('80 000 F, ROSE15, 68 000 F encaisses : 12 000 F de remise au rendez-vous', 12000,
    remiseDuComptoirAuRendezVous({ brutDuRituelXof: 80000, encaisseXof: 68000, resteAvantXof: 80000 }));
  dit('un ticket sans remise n ecrit rien', 0, remiseDuComptoirAuRendezVous({ brutDuRituelXof: 80000, encaisseXof: 80000, resteAvantXof: 80000 }));
  dit('un rendez-vous qui portait deja 10 % ne recoit que le complement', 4000,
    remiseDuComptoirAuRendezVous({ brutDuRituelXof: 80000, encaisseXof: 68000, resteAvantXof: 72000 }));
  dit('un acompte deja deduit : rien de plus a retirer', 0,
    remiseDuComptoirAuRendezVous({ brutDuRituelXof: 80000, encaisseXof: 68000, resteAvantXof: 60000 }));
  dit('une seule prestation au ticket : sa remise, pas celle du rituel entier', 4500,
    remiseDuComptoirAuRendezVous({ brutDuRituelXof: 30000, encaisseXof: 25500, resteAvantXof: 80000 }));
  dit('un soin offert a 100 % solde le rituel', 20000,
    remiseDuComptoirAuRendezVous({ brutDuRituelXof: 20000, encaisseXof: 0, resteAvantXof: 20000 }));

  const piece = { number: 'MND-0412', discountLabel: 'Offre Octobre Rose · ROSE15', globalDiscountXof: 12000 };
  dit('une piece d avant : la remise se propose, avec son libelle', { xof: 12000, piece: 'MND-0412', libelle: 'Offre Octobre Rose · ROSE15' },
    remiseDeFactureAReporter({ resteDuXof: 12000, factures: [piece] }));
  dit('... jamais plus que ce qui reste du', 5000, remiseDeFactureAReporter({ resteDuXof: 5000, factures: [piece] })?.xof ?? null);
  dit('... rien si le rendez-vous est solde', null, remiseDeFactureAReporter({ resteDuXof: 0, factures: [piece] }));
  dit('... rien si la piece ne nomme aucune remise (on ne devine pas)', null,
    remiseDeFactureAReporter({ resteDuXof: 12000, factures: [{ number: 'MND-0413', globalDiscountXof: 12000 }] }));
  dit('... rien sans piece', null, remiseDeFactureAReporter({ resteDuXof: 12000, factures: [] }));

  const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const caisseSoldee = sansCommentaires('src/apps/trone/routes/vente/Caisse.tsx');
  dit('la caisse ecrit la remise au rendez-vous qu elle solde', true,
    /remiseDuComptoirAuRendezVous\(\{/.test(caisseSoldee) && /discountXof: \(a\.discountXof \?\? 0\) \+ remise/.test(caisseSoldee));
  const encaisser = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
  dit('l ecran d encaissement propose de reporter la remise d une piece d avant', true,
    /remiseDeFactureAReporter\(\{/.test(encaisser) && /Reporter la remise au rendez-vous/.test(encaisser));
}

console.log(ko === 0 ? '\nLe raccord tient : les douze offres se resolvent comme elles se promettent.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
