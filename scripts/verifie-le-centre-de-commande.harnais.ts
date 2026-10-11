import { existsSync, readFileSync } from 'node:fs';
import { niveauRetenu, peutPartirSeule, peutSortir, peutValider, pasPermis } from '../src/shared/ia-validation-pur';
import { nomsEnInitiales, pourClaude, sansCoordonnees } from '../src/shared/ia-anonymise-pur';
import { compteurApres, coutDeLAppel, peutAppeler } from '../src/shared/ia-budget-pur';
import { DEVISE_DE_LA_MAISON, NOM_DE_LA_MAISON, PALETTE_DE_LA_MAISON, MEMOIRE } from '../src/shared/ia-memoire-pur';
import { briefingDeBase, comptesDesMissions, jourEnClair } from '../src/shared/ia-faits-pur';
import { CONSIGNES, schemaDeLaMission, schemaDuBriefing } from '../src/shared/ia-prompts-pur';
import { relisLaMission, relisLeBriefing } from '../src/shared/ia-relecture-pur';
import { AGENTS, IDS_DES_AGENTS } from '../src/shared/ia-agents-pur';
import { GENRES } from '../src/shared/ia-validation-pur';
// @ts-expect-error module .mjs sans types
import { copiesAJour } from './copie-dans-le-centre.mjs';

/* LE CENTRE DE COMMANDE, ÉPROUVÉ — 11 octobre 2026.
   `node scripts/verifie-le-centre-de-commande.mjs [--prouve]`.

   Les attentes viennent des PROMESSES (cahier du 11 octobre et choix de
   Yéman au sélecteur), écrites ici en toutes lettres : un contrat est une
   décision humaine, seuls Yéman et Brice valident, aucun numéro ne part, le
   plafond coupe à 10 $, la mémoire dit ce que disent ses sources, la
   fonction porte des copies exactes et garde ses portes. Avec --prouve,
   chaque règle de source est rejouée avec sa panne, et doit crier. */

let ko = 0;
const egal = (nom: string, vu: unknown, voulu: unknown) => {
  const ok = JSON.stringify(vu) === JSON.stringify(voulu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'RATE '} ${nom}${ok ? '' : `\n      vu ${JSON.stringify(vu)}\n      promis ${JSON.stringify(voulu)}`}`);
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ── 1. La validation (cahier § 20) ── */
egal('un contrat proposé « automatique » reste une décision humaine', niveauRetenu('contrat', 'auto'), 'humain');
egal('une publication proposée « automatique » se relit', niveauRetenu('publication', 'auto'), 'relecture');
egal('un message aux clientes n’est jamais automatique', niveauRetenu('message-clientes', 'auto'), 'relecture');
egal('une analyse peut partir seule', niveauRetenu('analyse', 'auto'), 'auto');
egal('un agent peut durcir un niveau', niveauRetenu('rapport', 'humain'), 'humain');
egal('un genre inconnu vaut une relecture', niveauRetenu('inconnu'), 'relecture');
egal('seule une tâche automatique sans drapeau part seule', [peutPartirSeule({ niveau: 'auto' }), peutPartirSeule({ niveau: 'auto', relectureExigee: true }), peutPartirSeule({ niveau: 'relecture' })], [true, false, false]);
egal('rien ne sort sans le oui d’un fondateur, et un non ferme la porte', [
  peutSortir({ niveau: 'relecture' }),
  peutSortir({ niveau: 'relecture', validation: { par: 'u', nom: 'Y', le: '', verdict: 'oui' } }),
  peutSortir({ niveau: 'humain', validation: { par: 'u', nom: 'Y', le: '', verdict: 'non' } }),
  peutSortir({ niveau: 'auto', relectureExigee: true }),
], [false, true, false, false]);
egal('seuls Yéman et Brice valident (rôle souverain)', ['souverain', 'gerant', 'maitre', undefined].map((r) => peutValider(r)), [true, false, false, false]);
egal('un contenu ne saute jamais la validation', [pasPermis('brouillon', 'publie'), pasPermis('brouillon', 'valide'), pasPermis('a-relire', 'valide'), pasPermis('valide', 'programme')], [false, false, true, true]);

/* ── 2. Rien de nominatif ne part (choix du 11 octobre) ── */
egal('un numéro béninois disparaît, sous toutes ses formes', ['+229 01 51 99 77 99', '0151997799', '97.00.00.00'].map(sansCoordonnees), ['[numéro]', '[numéro]', '[numéro]']);
egal('une adresse e-mail disparaît', sansCoordonnees('écrire à awa.d@exemple.com demain'), 'écrire à [adresse] demain');
egal('un montant et une date restent', sansCoordonnees('33 000 F le 2026-10-11'), '33 000 F le 2026-10-11');
egal('un nom complet devient prénom et initiale, dans les deux ordres', [
  nomsEnInitiales('Rappeler Awa Dossou', [{ prenom: 'Awa', nom: 'Dossou' }]),
  nomsEnInitiales('Rappeler DOSSOU Awa', [{ prenom: 'Awa', nom: 'Dossou' }]),
], ['Rappeler Awa D.', 'Rappeler Awa D.']);
egal('les deux barrières à la fois', pourClaude('Awa Dossou, +229 97 00 00 00', [{ prenom: 'Awa', nom: 'Dossou' }]), 'Awa D., [numéro]');

/* ── 3. Le plafond (10 $ par mois, choix du 11 octobre) ── */
egal('un million de jetons d’entrée du modèle courant coûte 3 $', coutDeLAppel('claude-sonnet-5-5', 1_000_000, 0), 3);
egal('un modèle inconnu se compte au prix le plus haut', coutDeLAppel('modele-inconnu', 0, 1_000_000), 75);
egal('à 9,99 $ un appel part encore, à 10 $ plus rien', [
  peutAppeler({ '2026-10': { usd: 9.99, appels: 1, entree: 0, sortie: 0 } }, '2026-10', 10).oui,
  peutAppeler({ '2026-10': { usd: 10, appels: 1, entree: 0, sortie: 0 } }, '2026-10', 10).oui,
  peutAppeler({}, '2026-10').plafond,
], [true, false, 10]);
egal('le compteur ajoute l’appel au bon mois', compteurApres({}, '2026-10', 'claude-sonnet-5-5', 1000, 1000)['2026-10'], { usd: 0.018, appels: 1, entree: 1000, sortie: 1000 });

/* ── 4. La relecture de ce que Claude rend ── */
const relue = relisLaMission({
  titre: 'Campagne — novembre',
  objectif: 'Préparer novembre, appeler le +229 97 00 00 00',
  taches: [{ titre: 'Signer le contrat du photographe', agent: 'agent-fantome', genre: 'contrat', niveau: 'auto', echeanceJours: 500, pourquoi: 'x' }],
  questions: ['a', 'b', 'c', 'd'],
}, IDS_DES_AGENTS, GENRES);
egal('la relecture relève le niveau, ramène l’agent, borne l’échéance, ôte tiret et numéro', [
  relue.titre, relue.objectif.includes('[numéro]'), relue.taches[0].niveau, relue.taches[0].agent, relue.taches[0].echeanceJours, relue.questions.length,
], ['Campagne, novembre', true, 'humain', 'orchestrateur', 120, 3]);
egal('un briefing relu garde au plus cinq priorités et des propositions au bon niveau', (() => {
  const b = relisLeBriefing({ titre: 't', resume: 'r', priorites: Array.from({ length: 8 }, (_, i) => ({ texte: `p${i}`, pourquoi: 'q' })), alertes: [], propositions: [{ texte: 'payer', agent: 'finance', genre: 'paiement', niveau: 'auto' }] }, IDS_DES_AGENTS, GENRES);
  return [b.priorites.length, b.propositions[0].niveau];
})(), [5, 'humain']);

/* ── 5. Le briefing de base, sans Claude ── */
egal('le premier du mois se dit « 1er », avec l’année', jourEnClair('2026-10-01'), 'jeudi 1er octobre 2026');
egal('le briefing de base dit d’abord ce qui attend un geste', briefingDeBase({
  jour: '2026-10-11', rdv: { nombre: 2, premiere: '09:00', derniere: '18:30' }, demandesNouvelles: 1, envoisEnAttente: 0,
  offres: [{ titre: 'Octobre Rose', remise: '−15 %', jusquau: '2026-10-31' }], validationsEnAttente: 2, tachesEnRetard: 0, missionsOuvertes: 0,
}).points.slice(0, 3), ['2 validations vous attendent dans le Centre de commande.', '1 demande du site attend une réponse.', '2 rendez-vous aujourd’hui, de 9 h à 18 h 30.']);
egal('les comptes des missions : à valider, en retard, ouvertes', comptesDesMissions([
  { statut: 'en-cours', taches: [{ statut: 'a-valider' }, { statut: 'a-faire', echeance: '2026-10-01' }, { statut: 'faite', echeance: '2026-10-01' }] },
  { statut: 'terminee', taches: [{ statut: 'a-valider' }] },
], '2026-10-11'), { validations: 1, retard: 1, ouvertes: 1 });

/* ── Les règles qui lisent les sources, avec leurs pannes ── */
type Entrees = { identite: string; couleurs: string; feuilleSite: string; registre: string; fonction: string; routes: string; centre: string; ecran: string; memoire: string };
const lis = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const entrees: Entrees = {
  identite: lis('src/shared/identite.ts'),
  couleurs: lis('src/ds/tokens/colors.css'),
  feuilleSite: lis('src/apps/revelateur/revelateur.css'),
  registre: lis('src/shared/registre.ts'),
  fonction: lis('supabase/functions/centre-de-commande/index.ts'),
  routes: lis('src/apps/trone/routes/index.tsx'),
  centre: lis('src/shared/ia-centre.ts'),
  ecran: lis('src/apps/trone/routes/pilotage/CentreDeCommande.tsx'),
  memoire: lis('src/shared/ia-memoire-pur.ts'),
};
type Regle = { nom: string; eprouve: (e: Entrees) => string[]; pannes: { nom: string; mute: (e: Entrees) => Entrees }[] };

const regles: Regle[] = [
  {
    nom: 'la mémoire dit ce que disent ses sources (devise, nom, palette, registre)',
    eprouve: (e) => {
      const x: string[] = [];
      const devise = /export const DEVISE_COMPLETE = '([^']+)'/.exec(e.identite)?.[1];
      const deviseMemoire = /export const DEVISE_DE_LA_MAISON = '([^']+)'/.exec(e.memoire)?.[1];
      if (!devise || devise !== deviseMemoire) x.push(`devise : identite.ts dit « ${devise} », la mémoire « ${deviseMemoire} »`);
      const nom = /nom: '([^']+)'/.exec(e.identite.slice(e.identite.indexOf('DEFAULT_IDENTITY')))?.[1];
      const nomMemoire = /export const NOM_DE_LA_MAISON = '([^']+)'/.exec(e.memoire)?.[1];
      if (!nom || nom !== nomMemoire) x.push(`nom : identite.ts dit « ${nom} », la mémoire « ${nomMemoire} »`);
      for (const [n, h] of Object.entries(PALETTE_DE_LA_MAISON)) if (!e.couleurs.toUpperCase().includes(h.toUpperCase()) && !e.feuilleSite.toUpperCase().includes(h.toUpperCase())) x.push(`${n} ${h} n’est dans aucun jeton`);
      if (!/RB\/COT\/26 A 120676/.test(e.registre) || !MEMOIRE.some((r) => r.faits.some((f) => f.includes('RB/COT/26 A 120676')))) x.push('le RCCM de la mémoire n’est pas celui du registre');
      if (DEVISE_DE_LA_MAISON !== deviseMemoire || NOM_DE_LA_MAISON !== nomMemoire) x.push('les constantes chargées ne sont pas celles du fichier');
      return x;
    },
    pannes: [
      { nom: 'une devise réécrite dans la mémoire', mute: (e) => ({ ...e, memoire: e.memoire.replace(/export const DEVISE_DE_LA_MAISON = '[^']+'/, "export const DEVISE_DE_LA_MAISON = 'vous êtes belle'") }) },
      { nom: 'une couleur qui n’existe nulle part', mute: (e) => ({ ...e, couleurs: e.couleurs.replace(/#1E2150/gi, '#000000'), feuilleSite: e.feuilleSite.replace(/#1E2150/gi, '#000000') }) },
    ],
  },
  {
    nom: 'la fonction porte des copies exactes des modules purs',
    eprouve: (e) => {
      const { ecarts } = copiesAJour(e.fonction, (p: string) => readFileSync(p, 'utf8')) as { ecarts: string[] };
      const blocs = (e.fonction.match(/DÉBUT DE LA COPIE/g) ?? []).length;
      return [...ecarts.map((p) => `copie périmée : ${p}`), ...(blocs === 11 ? [] : [`${blocs} blocs au lieu de 11`])];
    },
    pannes: [
      { nom: 'une copie retouchée à la main', mute: (e) => ({ ...e, fonction: e.fonction.replace("contrat: 'humain',", "contrat: 'auto',") }) },
    ],
  },
  {
    nom: 'la fonction garde ses portes : fondateur ou cron, mission aux fondateurs, plafond avant Claude, jamais les missions',
    eprouve: (e) => {
      const s = sansCommentaires(e.fonction.slice(e.fonction.indexOf('/* ── Qui appelle')));
      const x: string[] = [];
      if (!/\.eq\('user_id', uid\)\.maybeSingle\(\);\s*if \(!ligne \|\| \(ligne as \{ role\?: string \}\)\.role !== 'souverain'\) return null;/.test(s)) x.push('le fondateur n’est pas vérifié au rôle souverain');
      if (!/if \(mode === 'mission'\) \{\s*if \(!fondateur\) return json\(\{ error: 'forbidden' \}, 403\);/.test(s)) x.push('une mission peut se lancer sans fondateur');
      if (!/if \(!service && !fondateur\) return json\(\{ error: 'forbidden' \}, 403\);/.test(s)) x.push('un inconnu passe la porte');
      if (!/\.some\(\(cle\) => memeSecret\(recu,/.test(s)) x.push('la clé service ne se compare pas à temps constant');
      const plafond = s.indexOf('const permis = peutAppeler('), appel = s.indexOf('anthropic.messages.create(');
      if (plafond < 0 || appel < 0 || plafond > appel || !/if \(!permis\.oui\) throw new Plafond/.test(s)) x.push('le plafond ne se lit pas avant l’appel');
      if (/ecrisLeDocument\('mnd_ia_missions'/.test(s)) x.push('la fonction écrit les missions du Trône');
      if (/from\('clients'\)/.test(s)) x.push('la fonction lit la table des clientes');
      if (!/\.eq\('role', 'souverain'\)/.test(s.slice(s.indexOf('async function previensLesFondateurs')))) x.push('la notification ne vise pas les seuls fondateurs');
      if (!/const VERSION = '\d{4}-\d{2}-\d{2}-[a-z]'/.test(e.fonction)) x.push('pas de version datée');
      return x;
    },
    pannes: [
      { nom: 'la vérification du rôle retirée', mute: (e) => ({ ...e, fonction: e.fonction.replace(" || (ligne as { role?: string }).role !== 'souverain'", '') }) },
      { nom: 'le plafond lu après l’appel', mute: (e) => ({ ...e, fonction: e.fonction.replace('if (!permis.oui) throw new Plafond', 'if (false) throw new Plafond') }) },
      { nom: 'une écriture des missions', mute: (e) => ({ ...e, fonction: e.fonction.replace("await journalise({ qui, quoi: 'Mission découpée'", "await ecrisLeDocument('mnd_ia_missions', []); await journalise({ qui, quoi: 'Mission découpée'") }) },
    ],
  },
  {
    nom: 'l’écran est aux fondateurs, dans la Direction, né après les départements',
    eprouve: (e) => {
      const x: string[] = [];
      const direction = e.routes.slice(e.routes.indexOf("group: 'Direction'"), e.routes.indexOf("group:", e.routes.indexOf("group: 'Direction'") + 10));
      if (!direction.includes("path: '/centre-de-commande'")) x.push('pas dans le groupe Direction');
      if (!/export const ROUTES_SOUVERAIN = \[[^\]]*'\/centre-de-commande'/.test(e.routes)) x.push('pas réservé au souverain');
      if (!/ECRANS_NES_APRES_LES_DEPARTEMENTS: readonly string\[\] = \[[^\]]*'\/centre-de-commande'/.test(e.routes)) x.push('pas nommé parmi les écrans nés après les départements');
      if (!/staff && staff\.role !== 'souverain'/.test(e.ecran)) x.push('l’écran ne se ferme pas aux autres rôles');
      return x;
    },
    pannes: [
      { nom: 'l’écran ouvert à tous', mute: (e) => ({ ...e, routes: e.routes.replace(/(export const ROUTES_SOUVERAIN = \[[^\]]*?), '\/centre-de-commande'/, '$1') }) },
    ],
  },
  {
    nom: 'rien de nominatif ne part du Trône : objectif et notes passent par l’anonymisation',
    eprouve: (e) => {
      const x: string[] = [];
      const decoupe = e.centre.slice(e.centre.indexOf('export async function decoupeLObjectif'));
      if (!/const propre = objetPourClaude\(objectif, clientes\);/.test(decoupe) || !/appelle<[^>]+>\(\{ mode: 'mission', objectif: propre \}\)/.test(decoupe)) x.push('l’objectif part sans anonymisation');
      if (!/ajouteUneNote\(note\.rubrique, objetPourClaude\(note\.texte, personnes\), moi\)/.test(e.ecran)) x.push('une note entre en mémoire sans anonymisation');
      if (!/const propre = sansCoordonnees\(objectif\)/.test(e.fonction)) x.push('la fonction ne repasse pas l’objectif');
      return x;
    },
    pannes: [
      { nom: 'l’objectif envoyé tel quel', mute: (e) => ({ ...e, centre: e.centre.replace("{ mode: 'mission', objectif: propre }", "{ mode: 'mission', objectif }") }) },
    ],
  },
  {
    nom: 'aucun tiret cadratin dans ce que l’écran et la mémoire affichent',
    eprouve: (e) => [
      ...(sansCommentaires(e.ecran).includes('—') ? ['l’écran affiche un tiret cadratin'] : []),
      ...(MEMOIRE.some((r) => [r.titre, ...r.faits].some((f) => f.includes('—'))) ? ['la mémoire porte un tiret cadratin'] : []),
    ],
    pannes: [
      { nom: 'un tiret dans un libellé', mute: (e) => ({ ...e, ecran: e.ecran.replace('Les agents préparent, Yéman et Brice décident.', 'Les agents préparent — Yéman et Brice décident.') }) },
    ],
  },
];

/* ── Les consignes ── */
egal('chaque consigne porte sa version dans son nom', Object.entries(CONSIGNES).filter(([k, c]) => !/_v\d+$/.test(k) || c.id !== k || !k.endsWith(`_v${c.version}`)).map(([k]) => k), []);
egal('chaque consigne dit les règles de la Maison', Object.values(CONSIGNES).filter((c) => {
  const t = c.contraintes.join(' ');
  return !(/salon/.test(t) && /tiret cadratin/.test(t) && /année/.test(t) && /N’inventez rien/.test(t) && /Maison MND/.test(t));
}).map((c) => c.id), []);
egal('les schémas ne portent que ce que l’appel accepte (ni longueur ni bornes)', /maxLength|minLength|maxItems|minItems|"minimum"|"maximum"/.test(JSON.stringify([schemaDuBriefing(IDS_DES_AGENTS, GENRES), schemaDeLaMission(IDS_DES_AGENTS, GENRES)])), false);
egal('les agents nommés : un orchestrateur et une mémoire en phase 1', AGENTS.filter((a) => a.phase === 1).map((a) => a.id), ['orchestrateur', 'memoire']);

for (const r of regles) {
  const ecarts = r.eprouve(entrees);
  if (ecarts.length) { ko += 1; console.log(`RATE  ${r.nom}`); for (const x of ecarts) console.log(`      - ${x}`); }
  else console.log(`OK    ${r.nom}`);
}
if (process.argv.includes('--prouve')) {
  console.log('\n-- la preuve : chaque panne doit faire crier sa regle --');
  for (const r of regles) for (const p of r.pannes) {
    let crie = false;
    try { crie = r.eprouve(p.mute(entrees)).length > 0; } catch { crie = true; }
    if (crie) console.log(`OK    crie : ${p.nom}`);
    else { ko += 1; console.log(`RATE  muet devant « ${p.nom} » (${r.nom})`); }
  }
}
console.log(ko ? `\n${ko} RATE.` : '\nTout tient.');
process.exitCode = ko ? 1 : 0;
