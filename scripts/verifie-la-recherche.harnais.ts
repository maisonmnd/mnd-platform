import { existsSync, readFileSync } from 'node:fs';
import { DEVISE_DE_LA_MAISON, IDS_DES_MOTEURS, LONGUEUR_MAX_DU_LIEN, MODELES_DE_QUESTION, MOTEURS, ajouteALHistorique, effaceLaRecherche, historiqueVivant, lienDeRecherche, lienPermis, peutRechercher, questionComposee, questionDuModele, type Recherche } from '../src/shared/recherche-pur';

/* LA RECHERCHE DEPUIS LE TRÔNE, ÉPROUVÉE — 13 octobre 2026.
   `node scripts/verifie-la-recherche.mjs [--prouve]`.

   Les promesses : aucune dépense en plus des abonnements (donc AUCUN appel
   aux modèles depuis le Trône : la question s'ouvre dans claude.ai ou
   chatgpt.com, et nulle part ailleurs) ; ce qui part de l'écran passe par les
   barrières (prénom et initiale, jamais un numéro ni une adresse) ; la
   question elle-même ne se coupe jamais ; l'historique tient trente jours ;
   le bouton est aux fondateurs. Avec --prouve, chaque règle de source est
   rejouée avec sa panne, et doit crier. */

let ko = 0;
const egal = (nom: string, vu: unknown, voulu: unknown) => {
  const ok = JSON.stringify(vu) === JSON.stringify(voulu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'RATE '} ${nom}${ok ? '' : `\n      vu ${JSON.stringify(vu)}\n      promis ${JSON.stringify(voulu)}`}`);
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const decode = (lien: string) => decodeURIComponent(lien.split('q=')[1]);
const awa = [{ prenom: 'Awa', nom: 'Dossou' }];
const ecran = { titre: 'Carnet des clientes · Awa Dossou', texte: 'Awa Dossou, +229 01 51 99 77 99, awa.d@exemple.com. Locks fines, dernière venue le 2026-10-02.' };

/* ── 1. Rien ne part ailleurs que chez les deux services ── */
egal('deux moteurs, Claude et ChatGPT', IDS_DES_MOTEURS, ['claude', 'chatgpt']);
egal('un lien ouvre claude.ai ou chatgpt.com, et rien d’autre', [
  lienPermis(MOTEURS.claude.lien('x')), lienPermis(MOTEURS.chatgpt.lien('x')), lienPermis('https://api.anthropic.com/v1/messages'), lienPermis('https://claude.ai.exemple.com/new?q=x'), lienPermis('javascript:alert(1)'),
], [true, true, false, false, false]);
egal('la question arrive écrite, telle quelle', decode(lienDeRecherche('claude', 'Quelles huiles pour des locks fines ?', null, [])), 'Quelles huiles pour des locks fines ?');

/* ── 2. Les barrières sur ce qui part de l’écran ── */
const parti = questionComposee('Quels soins pour elle ?', ecran, awa);
egal('le nom complet devient prénom et initiale, dans le titre comme dans le texte', [parti.includes('Dossou'), (parti.match(/Awa D\./g) ?? []).length >= 2], [false, true]);
egal('le numéro et l’adresse disparaissent, la date reste', [parti.includes('01 51 99 77 99'), parti.includes('@'), parti.includes('[numéro]'), parti.includes('[adresse]'), parti.includes('2026-10-02')], [false, false, true, true, true]);
egal('la question elle-même passe aussi par les barrières', questionComposee('Rappeler Awa Dossou au 0151997799', null, awa), 'Rappeler Awa D. au [numéro]');
egal('sans l’écran, la question part seule', questionComposee('Une question', null, awa).includes('Contexte'), false);

/* ── 3. Un lien qui tient toujours, sans couper la question ── */
const longue = 'Q'.repeat(5000);
const l1 = lienDeRecherche('chatgpt', 'Courte', { titre: 'T', texte: 'x '.repeat(5000) }, []);
egal('un écran trop long se raccourcit jusqu’à ce que le lien tienne', [l1.length <= LONGUEUR_MAX_DU_LIEN, decode(l1).startsWith('Courte')], [true, true]);
egal('une question longue ne se coupe jamais, même si le lien dépasse', decode(lienDeRecherche('claude', longue, ecran, awa)).startsWith(longue), true);

/* ── 4. L’historique : trente jours, cent au plus, le plus récent d’abord ── */
const ici = '2026-10-13T10:00:00.000Z';
const r = (id: string, joursAvant: number): Recherche => ({ id, le: new Date(new Date(ici).getTime() - joursAvant * 86_400_000).toISOString(), moteur: 'claude', question: id });
egal('une recherche de 29 jours reste, une de 31 jours s’en va', historiqueVivant([r('a', 29), r('b', 31)], ici).map((x) => x.id), ['a']);
egal('la plus récente d’abord, et cent au plus', (() => { const l = ajouteALHistorique(Array.from({ length: 120 }, (_, i) => r(`r${i}`, i % 20)), r('neuve', 0), ici); return [l[0].id, l.length]; })(), ['neuve', 100]);

/* ── 5. Aux fondateurs ── */
egal('seuls Yéman et Brice voient le bouton (rôle souverain)', ['souverain', 'gerant', 'maitre', undefined].map(peutRechercher), [true, false, false, false]);


/* ── 6. 21 octobre 2026 : effacer, une ligne par question, la conversation qui ne se garde pas, les modèles ── */
const r2 = (id: string, joursAvant: number, moteur: 'claude' | 'chatgpt', question: string, modele?: string): Recherche => ({ id, le: new Date(new Date(ici).getTime() - joursAvant * 86_400_000).toISOString(), moteur, question, ...(modele ? { modele } : {}) });
const doublons = [r2('a', 1, 'claude', 'Répond à cet avis'), r2('b', 0, 'chatgpt', '  répond à cet  AVIS ')];
egal('la même question deux fois : une seule ligne, la plus récente, les deux moteurs', historiqueVivant(doublons, ici).map((x) => [x.id, x.moteurs]), [['b', ['chatgpt', 'claude']]]);
egal('même texte, autre modèle : deux lignes', historiqueVivant([r2('a', 1, 'claude', 'x'), r2('b', 0, 'claude', 'x', 'avis-google')], ici).length, 2);
egal('ajouter une question déjà posée ne la double pas', ajouteALHistorique(doublons, r2('c', 0, 'claude', 'répond à cet avis'), ici).length, 1);
egal('effacer une question emporte tous ses exemplaires', effaceLaRecherche([...doublons, r2('z', 0, 'claude', 'autre')], doublons[0]).map((x) => x.id), ['z']);
const tmp = lienDeRecherche('chatgpt', 'Ma question', null, [], { temporaire: true });
egal('ChatGPT en conversation temporaire : le lien le demande, la question arrive', [tmp.startsWith('https://chatgpt.com/?temporary-chat=true&q='), decode(tmp), lienPermis(tmp)], [true, 'Ma question', true]);
egal('sans le choix, ChatGPT s’ouvre comme avant', lienDeRecherche('chatgpt', 'Q', null, []).startsWith('https://chatgpt.com/?q='), true);
egal('Claude n’a pas de lien temporaire : le lien ne change pas, le panneau rappelle le fantôme', [lienDeRecherche('claude', 'Q', null, [], { temporaire: true }), MOTEURS.claude.seGardePas.parLien, /fantôme/.test(MOTEURS.claude.seGardePas.dit)], ['https://claude.ai/new?q=Q', false, true]);
const avis = questionDuModele('Merci Yéman et Brice, je vous embrasse de Kinshasa.', 'avis-google');
egal('le modèle « avis » porte l’avis, la devise et les règles', [avis.includes('je vous embrasse de Kinshasa'), avis.includes(DEVISE_DE_LA_MAISON), /vouvoiement/.test(avis), /Pas de prix/.test(avis), /sans supposer Madame ou Monsieur/.test(avis)], [true, true, true, true, true]);
egal('aucun modèle ne porte de tiret cadratin', MODELES_DE_QUESTION.filter((m) => m.gabarit('x').includes('—') || m.nom.includes('—') || m.invite.includes('—')).map((m) => m.id), []);
egal('sans modèle, la question part telle quelle', questionDuModele('  Une question  '), 'Une question');
egal('le modèle passe aussi par les barrières', decode(lienDeRecherche('claude', questionDuModele('Awa Dossou a écrit : merci', 'avis-google'), null, awa)).includes('Dossou'), false);

/* ── Les règles qui lisent les sources, avec leurs pannes ── */
type Entrees = { composant: string; pur: string; shell: string; css: string };
const lis = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const entrees: Entrees = { composant: lis('src/apps/trone/shell/Recherche.tsx'), pur: lis('src/shared/recherche-pur.ts'), shell: lis('src/apps/trone/shell/Shell.tsx'), css: lis('src/apps/trone/shell/recherche.css') };
type Regle = { nom: string; eprouve: (e: Entrees) => string[]; pannes: { nom: string; mute: (e: Entrees) => Entrees }[] };

const regles: Regle[] = [
  {
    nom: 'aucun appel aux modèles depuis le Trône : pas de clé, pas d’API, la fenêtre n’ouvre que le lien composé',
    eprouve: (e) => {
      const x: string[] = [];
      const s = sansCommentaires(e.composant + e.pur);
      if (/api\.anthropic\.com|api\.openai\.com|fetch\(|anthropic-ai\/sdk|invoke\(|appelle\(/.test(s)) x.push('le Trône appelle un service de modèles');
      if (!/if \(!lienPermis\(lien\)\) return false;/.test(sansCommentaires(e.composant))) x.push('la fenêtre peut s’ouvrir sur autre chose que les deux services');
      if (!/window\.open\(lien, 'mnd-recherche'/.test(sansCommentaires(e.composant))) x.push('la fenêtre ne s’ouvre pas sur le lien composé');
      return x;
    },
    pannes: [
      { nom: 'un appel direct à l’API', mute: (e) => ({ ...e, composant: e.composant.replace("const lien = lienDeRecherche(m, composee, e, personnes, { temporaire });", "const lien = lienDeRecherche(m, composee, e, personnes, { temporaire }); void fetch('https://api.anthropic.com/v1/messages');") }) },
      { nom: 'la garde du lien retirée', mute: (e) => ({ ...e, composant: e.composant.replace('if (!lienPermis(lien)) return false;', '') }) },
    ],
  },
  {
    nom: 'ce qui part passe par les barrières et le bouton est aux fondateurs',
    eprouve: (e) => {
      const x: string[] = [];
      const c = sansCommentaires(e.composant);
      if (!/if \(!peutRechercher\(role\)\) return null;/.test(c)) x.push('le bouton ne se ferme pas aux autres rôles');
      if (!/lienDeRecherche\(m, composee, e, personnes, \{ temporaire \}\)/.test(c)) x.push('le lien se compose sans les personnes (pas d’anonymisation)');
      if (!/export function lienDeRecherche[\s\S]*questionComposee\(question, ecran, personnes\)/.test(e.pur) || !/pourClaude\(String\(question/.test(e.pur)) x.push('la question ne passe pas par pourClaude');
      return x;
    },
    pannes: [
      { nom: 'le bouton ouvert à tous', mute: (e) => ({ ...e, composant: e.composant.replace('if (!peutRechercher(role)) return null;', '') }) },
      { nom: 'le lien composé sans les personnes', mute: (e) => ({ ...e, composant: e.composant.replace('lienDeRecherche(m, composee, e, personnes, { temporaire })', 'lienDeRecherche(m, composee, e, [], { temporaire })') }) },
    ],
  },
  {
    nom: 'le panneau est monté dans la barre du Trône, et son magasin n’est jamais relié au serveur',
    eprouve: (e) => {
      const x: string[] = [];
      if (!/<Trouver \/>[\s\S]{0,400}<Recherche \/>/.test(e.shell)) x.push('le bouton n’est pas dans la barre du haut');
      if (/bindDocument|bindCollection/.test(e.composant)) x.push('l’historique part au serveur');
      return x;
    },
    pannes: [
      { nom: 'le bouton retiré de la barre', mute: (e) => ({ ...e, shell: e.shell.replace('<Recherche />', '') }) },
      { nom: 'l’historique relié au serveur', mute: (e) => ({ ...e, composant: `${e.composant}\nbindDocument(recherchesStore);\n` }) },
    ],
  },
  {
    nom: 'aucun tiret cadratin dans ce que le panneau affiche',
    eprouve: (e) => (sansCommentaires(e.composant).includes('—') ? ['le panneau affiche un tiret cadratin'] : []),
    pannes: [{ nom: 'un tiret dans un libellé', mute: (e) => ({ ...e, composant: e.composant.replace('Rien n’est facturé au Trône.', 'Rien n’est facturé — au Trône.') }) }],
  },
];

for (const r of regles) {
  const ecarts = r.eprouve(entrees);
  if (ecarts.length) { ko += 1; console.log(`RATE  ${r.nom}`); for (const x of ecarts) console.log(`      - ${x}`); }
  else console.log(`OK    ${r.nom}`);
}
if (process.argv.includes('--prouve')) {
  console.log('\n-- la preuve : chaque panne doit faire crier sa regle --');
  for (const r of regles) for (const p of r.pannes) {
    const mute = p.mute(entrees);
    if (JSON.stringify(mute) === JSON.stringify(entrees)) { ko += 1; console.log(`RATE  la panne « ${p.nom} » ne change rien : elle ne prouve plus rien`); continue; }
    let crie = false;
    try { crie = r.eprouve(mute).length > 0; } catch { crie = true; }
    if (crie) console.log(`OK    crie : ${p.nom}`);
    else { ko += 1; console.log(`RATE  muet devant « ${p.nom} » (${r.nom})`); }
  }
}
console.log(ko ? `\n${ko} RATE.` : '\nTout tient.');
process.exitCode = ko ? 1 : 0;
