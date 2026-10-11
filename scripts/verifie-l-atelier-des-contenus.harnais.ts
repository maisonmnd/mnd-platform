import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { bloquant, relisLaMarque } from '../src/shared/ia-marque-pur';
import { declinaisonsDe, importeLesPlans, peutPasser, remarquesDuContenu, type Contenu, type SourceDeLUsine } from '../src/shared/ia-contenu-pur';
import { ENTREES_DES_PLANS, PLANS_DES_RESEAUX } from '../src/shared/ia-plans-des-reseaux';
import { PRISES_DE_BASE, apresLeChangement, avantDePublier, CHAMPS_DU_BRIEF, CHAMPS_DU_SCRIPT, ecartDeDuree, nouvelleSeance, nouveauScript, peutValiderLeBrief, peutValiderLeScript } from '../src/shared/ia-seance-pur';
import { PARCOURS, articleApresLeChangement, articleEnMarkdown, nouvelArticle, peutValiderLArticle, type Article } from '../src/shared/ia-journal-pur';
import { relisLeCalendrier } from '../src/shared/ia-relecture-pur';
import { CONSIGNES, schemaDeLArticle, schemaDeLaSeance, schemaDesDeclinaisons, schemaDuCalendrier, schemaDuScript } from '../src/shared/ia-prompts-pur';
import { AGENTS } from '../src/shared/ia-agents-pur';
// @ts-expect-error module .mjs sans types
import { moduleDesPlans, PLANS } from './extrais-les-plans-des-reseaux.mjs';

/* L'ATELIER DES CONTENUS, ÉPROUVÉ — 11 octobre 2026 (phase 2).
   `node scripts/verifie-l-atelier-des-contenus.mjs [--prouve]`.

   Les attentes viennent des PROMESSES, écrites ici en toutes lettres : la
   validation ne se saute pas et seuls Yéman et Brice la donnent ; le gardien
   de la marque bloque le tiret cadratin, « Kolétan » et un prix en campagne ;
   ce qu'on a validé est ce qu'on a lu ; le rythme léger (deux publications et
   une vidéo par semaine) ; un article sort dans la forme exacte du site ;
   rien de nominatif ne part ; rien ne se publie tout seul. Avec --prouve,
   chaque règle de source est rejouée avec sa panne, et doit crier. */

let ko = 0;
const egal = (nom: string, vu: unknown, voulu: unknown) => {
  const ok = JSON.stringify(vu) === JSON.stringify(voulu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'RATE '} ${nom}${ok ? '' : `\n      vu ${JSON.stringify(vu)}\n      promis ${JSON.stringify(voulu)}`}`);
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const regles = (t: string, o?: { campagne?: boolean; visuel?: boolean }) => relisLaMarque(t, o).map((r) => `${r.regle}:${r.gravite}`);
const ICI = '2026-10-11T09:00:00.000Z';
const oui = { par: 'u', nom: 'Yéman', le: ICI, verdict: 'oui' as const };

/* ── 1. Le gardien de la marque (règles de la Maison) ── */
egal('un tiret cadratin bloque', regles('Votre couronne — enfin.'), ['tiret:bloque']);
egal('« Kolétan » bloque, accent ou non', [regles('Kolétan Bright'), regles('koletan')], [['koletan:bloque'], ['koletan:bloque']]);
egal('un prix bloque dans une campagne, pas ailleurs', [regles('Le soin à 33 000 F', { campagne: true }), regles('Le soin à 33 000 F')], [['prix:bloque'], []]);
egal('un prix en FCFA ou en francs aussi', [regles('15000 FCFA', { campagne: true }), regles('dès 5 000 francs', { campagne: true })], [['prix:bloque'], ['prix:bloque']]);
egal('« salon » demande un jugement', regles('Venez au salon'), ['salon:attention']);
egal('« MND » seul demande un jugement ; « Maison MND », « Académie MND », « MND Kids », « MND 229 », @maison.mnd passent',
  [regles('Chez MND, on prend le temps'), regles('Maison MND, Académie MND, MND Kids, MND 229, #MND, @maison.mnd')], [['nom:attention'], []]);
egal('« MND Formation » se dit « Académie MND »', regles('Académie MND, ex MND Formation').includes('formation:attention'), true);
egal('une date sans année demande un jugement, avec son année elle passe', [regles('le 12 octobre'), regles('le 12 octobre 2026'), regles('le 1er novembre')], [['annee:attention'], [], ['annee:attention']]);
egal('un emoji demande un jugement', regles('Belle journée ✨'), ['emoji:attention']);
egal('les marques déposées de la Maison ne sont pas des emoji (DÀNDÀN™, SÍNSIN™, © et ®)', regles('Le DÀNDÀN™, le SÍNSIN™, KLƆKLƆ™ © ®'), []);
egal('la palette se relit sur une consigne d’image, pas dans un texte', [regles('un fond noir profond', { visuel: true }), regles('un fond noir')], [['palette:attention'], []]);
egal('un texte propre ne dit rien', regles('Votre beauté est déjà là. La Maison MND vous reçoit le 14 octobre 2026.', { campagne: true }), []);

/* ── 2. Les statuts : la validation ne se saute pas (cahier § 9) ── */
const pub = (o: Partial<Contenu> = {}): Contenu => ({ id: 'c', date: '2026-10-14', plateformes: ['instagram'], format: 'post', sujet: 'Le DÀNDÀN™ expliqué', legende: 'Une légende propre.', statut: 'a-relire', source: 'main', creeLe: ICI, ...o });
const passe = (c: Contenu, vers: Parameters<typeof peutPasser>[1], role = 'souverain') => peutPasser(c, vers, role).ok;
egal('un brouillon ne se publie pas, ne se valide pas d’un saut', [passe(pub({ statut: 'brouillon' }), 'publie'), passe(pub({ statut: 'brouillon' }), 'valide')], [false, false]);
egal('seuls Yéman et Brice valident', ['souverain', 'gerant', 'maitre', ''].map((r) => passe(pub(), 'valide', r)), [true, false, false, false]);
egal('une faute qui bloque empêche la validation', [passe(pub({ legende: 'Le soin à 33 000 F' }), 'valide'), passe(pub({ accroche: 'Enfin — vous' }), 'valide')], [false, false]);
egal('une remarque d’attention laisse trancher', passe(pub({ legende: 'Au salon, jamais.' }), 'valide'), true);
egal('programmé demande une date', [passe(pub({ statut: 'valide', date: '' }), 'programme'), passe(pub({ statut: 'valide' }), 'programme')], [false, true]);
egal('analysé demande un chiffre, optimisé ce qu’on retient', [
  passe(pub({ statut: 'publie' }), 'analyse'), passe(pub({ statut: 'publie', resultats: { portee: 120 } }), 'analyse'),
  passe(pub({ statut: 'analyse', resultats: { portee: 120 } }), 'optimise'), passe(pub({ statut: 'analyse', resultats: { portee: 120 }, retenu: 'Le carrousel porte.' }), 'optimise'),
], [false, true, false, true]);
egal('un bilan n’est pas une campagne : son sujet peut porter un chiffre', bloquant(remarquesDuContenu({ ...pub(), format: 'bilan', sujet: 'Bilan : 33 000 F investis' })), false);

/* ── 3. Les plans déjà préparés : importés à relire, jamais deux fois ── */
const premier = importeLesPlans([], ENTREES_DES_PLANS, ICI);
const second = importeLesPlans(premier.contenus, ENTREES_DES_PLANS, ICI);
egal('toutes les entrées des plans s’importent', premier.ajoutes, ENTREES_DES_PLANS.length);
egal('les plans comptent ce qu’ils portent', PLANS_DES_RESEAUX.reduce((n, p) => n + p.nombre, 0), ENTREES_DES_PLANS.length);
egal('un second import n’ajoute rien', second.ajoutes, 0);
egal('rien n’arrive validé ni publié : tout est à relire', [...new Set(premier.contenus.map((c) => c.statut))], ['a-relire']);
egal('chaque entrée a une date ISO et un réseau connu', premier.contenus.filter((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !c.plateformes.length).map((c) => c.id), []);
egal('un import garde ce qu’on a déjà fait d’une entrée', importeLesPlans([{ ...premier.contenus[0], statut: 'publie' }], ENTREES_DES_PLANS, ICI).contenus[0].statut, 'publie');

/* ── 4. L'usine : au rythme léger de la Maison, deux publications et une vidéo par semaine ── */
const sources: SourceDeLUsine[] = (['seance', 'video', 'article', 'contenu'] as const).map((genre) => ({ genre, titre: 'La couronne de Noël', date: '2026-10-12', id: genre }));
const tropParSemaine = sources.flatMap((s) => {
  const ds = declinaisonsDe(s).filter((d) => d.plateformes.includes('instagram'));
  const fin = Math.max(0, ...ds.map((d) => d.decalageJours));
  const x: string[] = [];
  for (let j = 0; j <= fin; j += 1) {
    const semaine = ds.filter((d) => d.decalageJours >= j && d.decalageJours < j + 7);
    const posts = semaine.filter((d) => d.format === 'post' || d.format === 'carrousel').length;
    const videos = semaine.filter((d) => d.format === 'reel').length;
    if (posts > 2 || videos > 1) x.push(`${s.genre}, sept jours depuis J+${j} : ${posts} publications, ${videos} vidéos`);
  }
  return [...new Set(x)];
});
egal('aucune source ne dépasse deux publications et une vidéo par semaine sur Instagram', tropParSemaine, []);
egal('une séance donne de quoi tenir trois semaines, sans rien publier', [declinaisonsDe(sources[0]).length >= 8, Math.max(...declinaisonsDe(sources[0]).map((d) => d.decalageJours)) >= 14], [true, true]);
egal('aucune déclinaison ne porte de faute de marque', sources.flatMap((s) => declinaisonsDe(s)).filter((d) => relisLaMarque(d.sujet, { campagne: true }).length).map((d) => d.sujet), []);

/* ── 5. La séance et le script ── */
const seance = nouvelleSeance({ id: 's', titre: 'La couronne de Noël', date: '2026-11-20', maintenant: ICI });
egal('les dix prises du cahier, numérotées de 1 à 10, rien de fait', [PRISES_DE_BASE.map((p) => p.num), seance.prises.every((p) => !p.faite)], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true]);
egal('pas de photo publiée sans l’accord inscrit ; un enfant, l’accord du parent ; le modèle en prénom et initiale', [
  avantDePublier({ accord: 'a-obtenir', enfant: false, modele: 'Awa D.' }).length,
  avantDePublier({ accord: 'a-obtenir', enfant: true, modele: 'Awa D.' }).length,
  avantDePublier({ accord: 'inscrit', enfant: false, modele: 'Awa Dossou' }).length,
  avantDePublier({ accord: 'inscrit', enfant: false, modele: 'Awa D.' }).length,
], [1, 2, 1, 0]);
const script = { ...nouveauScript({ id: 'v', titre: 'Le DÀNDÀN™ en trente secondes', maintenant: ICI }), statut: 'a-relire' as const };
egal('la durée des plans se compare à l’annoncée', [ecartDeDuree(script), ecartDeDuree({ ...script, duree: 20 })], [0, 10]);
egal('un script se valide par un fondateur, à relire, sans prix à l’écran', [
  peutValiderLeScript(script, 'souverain').ok, peutValiderLeScript(script, 'gerant').ok, peutValiderLeScript({ ...script, statut: 'brouillon' }, 'souverain').ok,
  peutValiderLeScript({ ...script, plans: script.plans.map((p, i) => (i === 2 ? { ...p, texteEcran: '25 000 F seulement' } : p)) }, 'souverain').ok,
], [true, false, false, false]);
egal('un brief se valide par un fondateur, une fois envoyé à relire', [peutValiderLeBrief({ statut: 'a-relire' }, 'souverain').ok, peutValiderLeBrief({ statut: 'brouillon' }, 'souverain').ok, peutValiderLeBrief({ statut: 'a-relire' }, 'maitre').ok], [true, false, false]);

/* ── 6. Ce qu'on a validé est ce qu'on a lu ── */
const briefValide = { ...seance, statut: 'valide' as const, validation: oui };
egal('un brief validé dont le décor change revient à relire, sans sa validation', [apresLeChangement(briefValide, { decor: 'Un mur ivoire' }, CHAMPS_DU_BRIEF).statut, apresLeChangement(briefValide, { decor: 'Un mur ivoire' }, CHAMPS_DU_BRIEF).validation], ['a-relire', undefined]);
egal('l’accord obtenu ou une prise faite ne le défont pas', [apresLeChangement(briefValide, { accord: 'inscrit' }, CHAMPS_DU_BRIEF).statut, apresLeChangement(briefValide, { prises: seance.prises.map((p) => ({ ...p, faite: true })) }, CHAMPS_DU_BRIEF).statut], ['valide', 'valide']);
egal('un même texte retapé ne défait rien ; un statut donné l’emporte', [apresLeChangement(briefValide, { decor: briefValide.decor }, CHAMPS_DU_BRIEF).statut, apresLeChangement(briefValide, { decor: 'x', statut: 'brouillon' }, CHAMPS_DU_BRIEF).statut], ['valide', 'brouillon']);
egal('un script validé dont l’accroche change revient à relire', apresLeChangement({ ...script, statut: 'valide' as const, validation: oui }, { accroche: 'Autre' }, CHAMPS_DU_SCRIPT).statut, 'a-relire');

/* ── 7. Le Journal : un article complet, validé par un fondateur ── */
const corps = ['## Pourquoi la nuit compte', '', ...Array.from({ length: 34 }, (_, i) => `Phrase ${i + 1} sur le soin des locks la nuit, le satin, la tresse lâche et la patience qui garde la couronne belle.`), '', '## Ce que la Maison en dit', '', 'Une couronne se garde la nuit comme le jour.'].join('\n');
const article: Article = { ...nouvelArticle({ id: 'a', titre: 'Comment protéger ses locks la nuit ?', maintenant: ICI }), etape: 'validation', description: 'Satin, tresse lâche, bonnet : comment protéger ses dreadlocks la nuit sans les écraser ni les assécher.', motsCles: ['locks la nuit', 'bonnet satin locks', 'protéger ses dreadlocks'], image: 'journal-4.jpg', corps, aVerifier: [{ fait: 'Le satin réduit la friction', verifie: true }] };
egal('un article complet se valide, par un fondateur seulement', [peutValiderLArticle(article, 'souverain').ok, peutValiderLArticle(article, 'gerant').ok, peutValiderLArticle({ ...article, etape: 'edition' }, 'souverain').ok], [true, false, false]);
egal('un fait non vérifié, un texte trop court, un prix : pas de validation', [
  peutValiderLArticle({ ...article, aVerifier: [{ fait: 'x', verifie: false }] }, 'souverain').ok,
  peutValiderLArticle({ ...article, corps: 'Trop court.' }, 'souverain').ok,
  peutValiderLArticle({ ...article, corps: `${corps}\n\nLe soin coûte 33 000 F.` }, 'souverain').ok,
], [false, false, false]);
egal('une cliente ne va pas sur un article qui nomme un défaut', peutValiderLArticle({ ...article, titre: 'Pourquoi mes locks cassent ?', portrait: 'cliente-2.jpg' }, 'souverain').ok, false);
const publie = { ...article, etape: 'publication' as const, validation: oui };
egal('un article validé dont le texte change revient à la validation ; un fait coché ne le défait pas', [
  articleApresLeChangement(publie, { corps: `${corps}\nUne phrase.` }).etape, articleApresLeChangement(publie, { corps: `${corps}\nUne phrase.` }).validation,
  articleApresLeChangement(publie, { aVerifier: [] }).etape,
], ['validation', undefined, 'publication']);

/* ── 8. Ce que rend un agent passe par la relecture ── */
const rendu = relisLeCalendrier({ publications: [
  { date: '2026-10-14', plateformes: ['instagram', 'myspace'], format: 'post', pilier: 'beaute', sujet: 'Le soin — enfin', legende: 'Écrivez au +229 01 51 99 77 99' },
  { date: '2026-12-25', plateformes: ['instagram'], format: 'post', sujet: 'Hors de la période' },
  { date: '2026-10-15', plateformes: ['myspace'], format: 'post', sujet: 'Aucun réseau connu' },
] }, '2026-10-12', '2026-10-25', { plateformes: ['instagram', 'facebook'], formats: ['post'], piliers: ['beaute'] });
egal('la relecture garde la période et les réseaux connus, ôte le tiret et le numéro', rendu.map((p) => [p.date, p.plateformes, p.sujet, p.legende]), [['2026-10-14', ['instagram'], 'Le soin, enfin', 'Écrivez au [numéro]']]);

/* ── 9. Les consignes et les schémas de la phase 2 ── */
const phase2 = AGENTS.filter((a) => a.phase === 2 && a.consigne);
egal('chaque agent de la phase 2 qui écrit a sa consigne, à son nom', phase2.filter((a) => (CONSIGNES as Record<string, { agent: string }>)[a.consigne as string]?.agent !== a.id).map((a) => a.id), []);
const listes = { plateformes: ['instagram'], formats: ['post'], piliers: ['beaute'], parcours: ['entretien'] };
egal('les schémas de la phase 2 ne portent que ce que l’appel accepte', /maxLength|minLength|maxItems|minItems|"minimum"|"maximum"/.test(JSON.stringify([schemaDuCalendrier(listes), schemaDesDeclinaisons(listes), schemaDeLArticle(listes), schemaDeLaSeance(), schemaDuScript()])), false);

/* ── Les règles qui lisent les sources, avec leurs pannes ── */
type Entrees = { routes: string; ecran: string; centreEcran: string; atelier: string; fonction: string; generateur: string; articles: Record<string, string>; maquettes: Record<string, string>; modulePlans: string };
const lis = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '');
const JOURNAL = 'docs/site-revelateur/journal';
const entrees: Entrees = {
  routes: lis('src/apps/trone/routes/index.tsx'),
  ecran: lis('src/apps/trone/routes/equipe/AtelierDesContenus.tsx'),
  centreEcran: lis('src/apps/trone/routes/pilotage/CentreDeCommande.tsx'),
  atelier: lis('src/shared/ia-atelier.ts'),
  fonction: lis('supabase/functions/centre-de-commande/index.ts'),
  generateur: lis('scripts/genere-revelateur.mjs'),
  articles: Object.fromEntries(readdirSync(JOURNAL).filter((f) => f.endsWith('.md') && f !== 'index.md').map((f) => [f, lis(`${JOURNAL}/${f}`)])),
  maquettes: Object.fromEntries((PLANS as { fichier: string }[]).map((p) => [p.fichier, lis(p.fichier)])),
  modulePlans: lis('src/shared/ia-plans-des-reseaux.ts'),
};
type Regle = { nom: string; eprouve: (e: Entrees) => string[]; pannes: { nom: string; mute: (e: Entrees) => Entrees }[] };

/** Le lecteur d'articles du SITE lui-même, tiré du générateur : l'export de
    l'atelier est lu par le code qui le lira en vrai. */
function lecteurDuSite(generateur: string): ((md: string) => Record<string, unknown> | null) | null {
  const src = /function litArticle\(fichier\) \{[\s\S]*?\n\}\n/.exec(generateur)?.[0];
  if (!src) return null;
  return new Function('readFileSync', `${src}\nreturn litArticle;`)((x: string) => x);
}
const clesDeTete = (md: string) => (/^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? '').split('\n').map((l) => /^(\w+):/.exec(l)?.[1]).filter((k): k is string => !!k && k !== 'portrait');
const derniereLigne = (md: string) => md.split('\n').filter((l) => l.trim()).at(-1)?.trim() ?? '';

const reglesDeSource: Regle[] = [
  {
    nom: 'un article de l’atelier se lit par le lecteur du site, champ pour champ',
    eprouve: (e) => {
      const lit = lecteurDuSite(e.generateur);
      if (!lit) return ['le lecteur d’articles du site est introuvable dans le générateur'];
      const x: string[] = [];
      const a = { ...publie, portrait: 'cliente-3.jpg', parcours: 'reparation' as const };
      const md = articleEnMarkdown(a, '2026-10-14');
      const r = lit(md) ?? {};
      const voulu: Record<string, unknown> = { titre: a.titre, slug: a.slug, date: '2026-10-14', description: a.description, parcours: a.parcours, image: a.image, portrait: a.portrait, motsCles: a.motsCles };
      for (const [k, v] of Object.entries(voulu)) if (JSON.stringify(r[k]) !== JSON.stringify(v)) x.push(`${k} : le site lit ${JSON.stringify(r[k])}, l’atelier a écrit ${JSON.stringify(v)}`);
      if (!String(r.corps ?? '').startsWith(`# ${a.titre}\n`)) x.push('le corps ne commence pas par le titre en « # »');
      if (derniereLigne(md) !== PARCOURS[a.parcours].bouton) x.push('la dernière ligne n’est pas le bouton du parcours');
      const deja = articleEnMarkdown({ ...a, corps: `${corps}\n\n## Et maintenant\n\nVotre couronne vous attend.\n\n${PARCOURS[a.parcours].bouton}` }, '2026-10-14');
      if ((deja.match(/## Et maintenant/g) ?? []).length !== 1) x.push('« Et maintenant » se répète quand le texte l’a déjà');
      for (const [f, vrai] of Object.entries(e.articles)) if (clesDeTete(vrai).join(',') !== clesDeTete(md).join(',')) x.push(`l’en-tête de ${f} (${clesDeTete(vrai).join(', ')}) n’a pas l’ordre de l’atelier (${clesDeTete(md).join(', ')})`);
      return x;
    },
    pannes: [
      { nom: 'un site qui garde les guillemets', mute: (e) => ({ ...e, generateur: e.generateur.replace(`kv[2].replace(/^"(.*)"$/, '$1').trim()`, 'kv[2].trim()') }) },
    ],
  },
  {
    nom: 'le bouton de chaque parcours est celui des articles du site',
    eprouve: (e) => Object.entries(e.articles).flatMap(([f, md]) => {
      const p = /^parcours:\s*(\S+)/m.exec(md)?.[1] as keyof typeof PARCOURS | undefined;
      if (!p || !PARCOURS[p]) return [];
      return derniereLigne(md) === PARCOURS[p].bouton ? [] : [`${f} (${p}) finit par « ${derniereLigne(md)} », l’atelier écrirait « ${PARCOURS[p].bouton} »`];
    }),
    pannes: [
      { nom: 'un article du site qui change de bouton', mute: (e) => ({ ...e, articles: { ...e.articles, 'hydrater-ses-locks.md': e.articles['hydrater-ses-locks.md'].replace(/Réserver mon entretien\s*$/, 'Écrivez-nous') } }) },
    ],
  },
  {
    nom: 'le module des plans dit ce que disent les trois maquettes',
    eprouve: (e) => (moduleDesPlans((f: string) => e.maquettes[f]) === e.modulePlans ? [] : ['le module des plans ne dit plus les maquettes : refaire scripts/extrais-les-plans-des-reseaux.mjs']),
    pannes: [
      { nom: 'une date retouchée à la main dans le module', mute: (e) => ({ ...e, modulePlans: e.modulePlans.replace('"date": "2026-', '"date": "2027-') }) },
    ],
  },
  {
    nom: 'l’atelier est aux fondateurs, dans Marketing & Fidélité, né après les départements, compté au Centre',
    eprouve: (e) => {
      const x: string[] = [];
      const debut = e.routes.indexOf("group: 'Marketing & Fidélité'");
      const groupe = e.routes.slice(debut, e.routes.indexOf('group:', debut + 10));
      if (debut < 0 || !groupe.includes("path: '/atelier-des-contenus'")) x.push('pas dans le groupe Marketing & Fidélité');
      if (!/export const ROUTES_SOUVERAIN = \[[^\]]*'\/atelier-des-contenus'/.test(e.routes)) x.push('pas réservé au souverain');
      if (!/ECRANS_NES_APRES_LES_DEPARTEMENTS: readonly string\[\] = \[[^\]]*'\/atelier-des-contenus'/.test(e.routes)) x.push('pas nommé parmi les écrans nés après les départements');
      if (!/staff && staff\.role !== 'souverain'/.test(e.ecran)) x.push('l’écran ne se ferme pas aux autres rôles');
      if (!/navigate\('\/atelier-des-contenus'\)/.test(sansCommentaires(e.centreEcran)) || !/aRelire: contenus\.filter/.test(e.centreEcran)) x.push('le Centre ne compte pas ce qui attend à l’atelier');
      return x;
    },
    pannes: [
      { nom: 'l’atelier ouvert à tous', mute: (e) => ({ ...e, routes: e.routes.replace(/(export const ROUTES_SOUVERAIN = \[[^\]]*?), '\/atelier-des-contenus'/, '$1') }) },
      { nom: 'l’écran sans garde', mute: (e) => ({ ...e, ecran: e.ecran.replace("staff && staff.role !== 'souverain'", 'false') }) },
    ],
  },
  {
    nom: 'rien de nominatif ne part : chaque demande aux agents passe par l’anonymisation, deux fois',
    eprouve: (e) => {
      const x: string[] = [];
      const s = sansCommentaires(e.atelier);
      const demande = s.slice(s.indexOf('async function demandeALAgent'), s.indexOf('\n}\n', s.indexOf('async function demandeALAgent')));
      if (!/const propre = objetPourClaude\(corps, personnes\);/.test(demande) || !/appelle<[^>]+>\(\{ mode: 'contenu', genre, \.\.\.propre \}\)/.test(demande)) x.push('la demande part sans anonymisation');
      if ((s.match(/appelle</g) ?? []).length !== 1) x.push('un appel aux agents contourne demandeALAgent');
      if (!/const propreCourt = \(v: unknown, max = \d+\): string => sansCoordonnees\(/.test(e.fonction)) x.push('la fonction ne repasse pas ce qu’elle reçoit');
      return x;
    },
    pannes: [
      { nom: 'la demande envoyée telle quelle', mute: (e) => ({ ...e, atelier: e.atelier.replace("{ mode: 'contenu', genre, ...propre }", "{ mode: 'contenu', genre, ...corps }") }) },
      { nom: 'un appel direct', mute: (e) => ({ ...e, atelier: `${e.atelier}\nexport const court = () => appelle<unknown>({ mode: 'contenu', genre: 'article' });\n` }) },
    ],
  },
  {
    nom: 'la fonction : le contenu aux fondateurs, chaque réponse relue, aucune écriture',
    eprouve: (e) => {
      const x: string[] = [];
      const s = sansCommentaires(e.fonction);
      if (!/if \(mode === 'contenu'\) \{\s*if \(!fondateur\) return json\(\{ error: 'forbidden' \}, 403\);/.test(s)) x.push('un contenu se demande sans fondateur');
      const debut = s.indexOf('async function leContenu');
      const corpsDeLaFonction = debut < 0 ? '' : s.slice(debut, s.indexOf('\n}\n', debut));
      if (!corpsDeLaFonction) x.push('leContenu introuvable');
      if (/ecrisLeDocument\(/.test(corpsDeLaFonction)) x.push('leContenu écrit dans les documents du Trône');
      for (const r of ['relisLeCalendrier', 'relisLArticle', 'relisLaSeance', 'relisLeScript']) if (!corpsDeLaFonction.includes(`${r}(`)) x.push(`${r} ne relit pas sa réponse`);
      if (!/await demandeAClaude\(systemePour\(consigne, memoire\), message, schema, maximum\)/.test(corpsDeLaFonction)) x.push('le contenu ne passe pas par demandeAClaude (et son plafond)');
      return x;
    },
    pannes: [
      { nom: 'la porte du contenu retirée', mute: (e) => ({ ...e, fonction: e.fonction.replace(/(if \(mode === 'contenu'\) \{[\s\S]*?)if \(!fondateur\) return json\(\{ error: 'forbidden' \}, 403\);/, '$1') }) },
      { nom: 'une écriture dans leContenu', mute: (e) => ({ ...e, fonction: e.fonction.replace('    const rendu = relis(brut);', "    const rendu = relis(brut);\n    await ecrisLeDocument('mnd_ia_contenus', []);") }) },
    ],
  },
  {
    nom: 'rien ne se publie tout seul : aucun réseau n’est appelé',
    eprouve: (e) => [e.fonction, e.atelier, e.ecran].flatMap((t, i) => (/graph\.facebook\.com|graph\.instagram\.com|tiktokapis\.com|api\.linkedin\.com|googleapis\.com\/youtube/.test(sansCommentaires(t)) ? [`${['la fonction', 'l’atelier', 'l’écran'][i]} appelle un réseau`] : [])),
    pannes: [
      { nom: 'une publication vers Meta', mute: (e) => ({ ...e, atelier: `${e.atelier}\nexport const pousse = () => fetch('https://graph.facebook.com/v21.0/me/feed');\n` }) },
    ],
  },
  {
    nom: 'aucun tiret cadratin dans ce que l’atelier affiche',
    eprouve: (e) => (sansCommentaires(e.ecran).includes('—') ? ['l’écran affiche un tiret cadratin'] : []),
    pannes: [
      { nom: 'un tiret dans un libellé', mute: (e) => ({ ...e, ecran: e.ecran.replace('Les agents proposent, la marque relit, Yéman et Brice valident.', 'Les agents proposent — Yéman et Brice valident.') }) },
    ],
  },
];

for (const r of reglesDeSource) {
  const ecarts = r.eprouve(entrees);
  if (ecarts.length) { ko += 1; console.log(`RATE  ${r.nom}`); for (const x of ecarts) console.log(`      - ${x}`); }
  else console.log(`OK    ${r.nom}`);
}
if (process.argv.includes('--prouve')) {
  console.log('\n-- la preuve : chaque panne doit faire crier sa regle --');
  for (const r of reglesDeSource) for (const p of r.pannes) {
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
