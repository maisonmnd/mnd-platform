/* « ENVOYER MAINTENANT », ÉPROUVÉ — 18 novembre 2026.
   `node scripts/verifie-envoyer-maintenant.mjs` (et `--prouve`).

   La règle `shared/envoyer-maintenant-pur` sur de vraies lectures de
   l'Assistant (`lisLAssistant`, comme le Trône et la fonction serveur), puis
   le passage du même jour et celui du lendemain, rejoués avec la ligne
   envoyée dans le journal. Enfin la lettre de l'écran, du dépôt et du
   facteur. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import { lisLAssistant, type EntreesDeLAssistant } from '../src/shared/assistant-lecture-pur';
import { lignesDuPassage, lignesNeuves } from '../src/shared/assistant-passage-pur';
import { anniversaireDuJour, idDeLaLigne, planDuJour, promesseDe, MOTIF_DE_LA_PROMESSE, plusJours, type FicheDeGerard, type Situation, type ContexteDeGerard, type TraceDeGerard } from '../src/shared/gerard-pur';
import { REGLES_PAR_DEFAUT, peutPartir } from '../src/shared/salle-des-envois';
import { fusionnePlanEtSalle, type EnvoiDuJour } from '../src/shared/assistant-aujourdhui-pur';
import { gesteDuMaintenant, ligneDuMaintenant, porteDuMaintenant, RAISON_DU_MAINTENANT } from '../src/shared/envoyer-maintenant-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Le décor : mercredi 18 novembre 2026, 20 h 44 à Cotonou (19 h 44 UTC), les heures calmes. ── */
const D = '2026-11-18';
const SOIR = Date.parse(`${D}T19:44:00Z`);
const TOUS_APPROUVES = ['assistant_maison_garder', 'assistant_maison_avant', 'assistant_maison_envie', 'assistant_maison_place', 'assistant_maison_anniversaire',
  'assistant_maison_carte_anniversaire', 'assistant_maison_carte_foyer', 'assistant_maison_fetes', 'assistant_maison_endormie', 'nouvelles_de_la_maison'];
const REGLAGES = { mode: 'ouvert', approuves: TOUS_APPROUVES, eteintes: ['creux'], remisesParSemaine: 8, plafondFrancs: 60000 };
const OUI = { oui: true, le: '2026-01-01', par: 'comptoir' };
const tete = (id: string, o: Record<string, unknown> = {}) => ({ id, branchId: 'b', name: `${id.toUpperCase()} X.`, phone: '+229 01 51 00 00 11', nouvelles: OUI, segments: [], ...o });
const rituel = (id: string, clientId: string, date: string, o: Record<string, unknown> = {}) =>
  ({ id, branchId: 'b', clientId, serviceIds: ['s1'], date, time: '10:00', status: 'honoré', master: 'Aimée', ...o });
/* Une nouvelle de Perle partie il y a `jours` jours (une envie : elle compte dans la promesse). */
const nouvelle = (clientId: string, jours: number, n = 1) =>
  ({ id: `gerard-${plusJours(D, -jours)}-${clientId}-whatsapp-${n}`, type: 'gerard', canal: 'whatsapp', clientId, statut: 'envoyé', genre: 'envie', modele: 'envie', deposeLe: `${plusJours(D, -jours)}T09:00:00Z`, quand: `${plusJours(D, -jours)}T09:00:00Z` });

const CLIENTES = [
  /* SB. : son anniversaire aujourd'hui, une nouvelle partie il y a 16 jours (la promesse en est à une). */
  tete('sb', { birthday: '1991-11-18' }),
  /* FK. : en plein fil, son RDV posé dans 40 jours, sa dernière venue il y a 35 jours : en saison, les places des fêtes (une sollicitation, modèle « fetes »). */
  tete('fk'),
  /* NM. : « Non merci » aux nouvelles, son anniversaire aujourd'hui : la carte part quand même (un vœu). */
  tete('nm', { birthday: '1988-11-18', nouvelles: { oui: false, le: '2026-11-02', par: 'whatsapp' } }),
  /* MC. : son anniversaire aujourd'hui, sans numéro, abonnée à Ma Couronne : sa carte part en notification. */
  tete('mc', { birthday: '1990-11-18', authUserId: 'u-mc', phone: '' }),
];
const entrees = (o: Partial<EntreesDeLAssistant> = {}): EntreesDeLAssistant => ({
  aujourdhui: D, maintenantMs: SOIR, branche: { id: 'b', seats: 2 },
  clients: CLIENTES as never,
  rdvs: [rituel('fk1', 'fk', plusJours(D, -90)), rituel('fk2', 'fk', plusJours(D, -35)), rituel('fk3', 'fk', plusJours(D, 40), { status: 'confirmé' })] as never,
  prestations: new Map([['s1', { name: 'SÍNSIN™ Essentiel · La Reprise', durationMin: 120 }]]) as never,
  signalements: [], abonnes: new Set(['u-mc']),
  envois: [nouvelle('sb', 16)],
  messages: [], pieces: [], blocages: [], familles: [], cartes: [], codes: [],
  reglagesGerard: REGLAGES,
  ouverture: (iso) => ({ closed: new Date(`${iso}T12:00:00Z`).getUTCDay() === 0, openMin: 480, closeMin: 1140 }),
  ...o,
});

const cerveau = lisLAssistant(entrees());
const plan = planDuJour(cerveau.fiches, cerveau.ctx);
const situ = (id: string) => plan.find((s) => s.clientId === id)!;
const ficheDe = (c: typeof cerveau, id: string) => c.fiches.find((f) => f.id === id);
const porte = (s: Situation, o: { envois?: readonly { id: string }[]; reglages?: unknown; fiche?: FicheDeGerard; nouvelles?: { oui?: boolean; par?: string } | null; tel?: string; destinataire?: Pick<FicheDeGerard, 'stop'> } = {}) => porteDuMaintenant({
  situation: s, reglagesGerard: o.reglages ?? REGLAGES,
  dejaUneLigne: (o.envois ?? []).some((e) => e.id === idDeLaLigne(D, s.clientId, 'whatsapp') || e.id === idDeLaLigne(D, s.clientId, 'push') || e.id === idDeLaLigne(D, s.clientId, 'wa-main')),
  fiche: o.fiche ?? ficheDe(cerveau, s.clientId), destinataire: o.destinataire, nouvelles: o.nouvelles === undefined ? cerveau.clientDe(s.clientId)?.nouvelles : o.nouvelles,
  telephone: o.tel ?? cerveau.telDe(s), aujourdhui: D,
});

/* ── 0. Le décor tient : ce que le plan du soir dit de chacune ── */
dit('le plan du soir : la carte de SB. et de NM. sur WhatsApp, les places des fêtes pour FK. sur WhatsApp, la carte de MC. sur Ma Couronne', [['sb', 'anniversaire', 'whatsapp'], ['fk', 'noel', 'whatsapp'], ['nm', 'anniversaire', 'whatsapp'], ['mc', 'anniversaire', 'couronne']],
  ['sb', 'fk', 'nm', 'mc'].map((id) => { const s = plan.find((x) => x.clientId === id); return s ? [id, s.genre, s.canal] : [id, null, null]; }));

/* ── 1. Le bouton n'apparaît que sur une ligne qui attend son heure ── */
const sb = situ('sb'); const fk = situ('fk'); const nm = situ('nm'); const mc = situ('mc');
dit('le bouton, ouvert : la carte de SB. et les fêtes de FK., approuvées chez Meta, pas encore en salle', [{ bouton: true, ouvert: true }, { bouton: true, ouvert: true }],
  [porte(sb), porte(fk)]);
dit('... pas de bouton sur une ligne déjà en salle, déjà partie ou écartée (la salle a son propre « Envoyer maintenant »)', [{ bouton: false }, { bouton: false }, { bouton: false }],
  [porte(sb, { envois: [{ id: idDeLaLigne(D, 'sb', 'whatsapp') }] }), porte(fk, { envois: [{ id: idDeLaLigne(D, 'fk', 'whatsapp') }] }), porte(fk, { envois: [{ id: idDeLaLigne(D, 'fk', 'wa-main') }] })]);
dit('... pas de bouton quand le modèle n’est pas approuvé chez Meta (il a son bouton à la main), ni sur Ma Couronne, ni en pause', [{ bouton: false }, { bouton: false }, { bouton: false }, { bouton: false }],
  [porte(sb, { reglages: { ...REGLAGES, approuves: [] } }), porte(fk, { reglages: { ...REGLAGES, approuves: ['assistant_maison_carte_anniversaire', 'assistant_maison_anniversaire'] } }),
    porte(mc), porte(sb, { reglages: { ...REGLAGES, mode: 'eteint' } })]);
dit('... pas de bouton sur une relance à la main (sans accord, elle ne part jamais seule)', { bouton: false }, porte({ ...fk, genre: 'retard', modele: 'place', aLaMainSeulement: true }));
dit('... sans numéro WhatsApp : le bouton fermé, et pourquoi', { bouton: true, ouvert: false, raison: RAISON_DU_MAINTENANT.sansNumero }, porte(fk, { tel: '' }));

/* ── 2. L'accord des nouvelles, le « stop » ── */
const fkSansAccord = { ...ficheDe(cerveau, 'fk')!, accord: false };
dit('l’accord refusé ferme le bouton d’une sollicitation, avec sa raison', { bouton: true, ouvert: false, raison: 'accord des nouvelles refusé' },
  porte(fk, { fiche: fkSansAccord, nouvelles: { oui: false, par: 'whatsapp' } }));
dit('... jamais demandé : fermé aussi, « sans accord des nouvelles »', { bouton: true, ouvert: false, raison: 'sans accord des nouvelles' },
  porte(fk, { fiche: fkSansAccord, nouvelles: null }));
dit('... la carte d’anniversaire est un vœu : « Non merci » aux nouvelles ne la ferme pas (le passage du matin la porterait)', [{ bouton: true, ouvert: true }, false],
  [porte(nm), ficheDe(cerveau, 'nm')!.accord]);
dit('... un « stop » la ferme, le sien ou celui du parent qui la reçoit', [{ bouton: true, ouvert: false, raison: RAISON_DU_MAINTENANT.stop }, { bouton: true, ouvert: false, raison: RAISON_DU_MAINTENANT.stop }],
  [porte(sb, { fiche: { ...ficheDe(cerveau, 'sb')!, stop: true } }), porte({ ...sb, pourId: 'parent' }, { destinataire: { stop: true }, tel: '+229 01 51 00 00 22' })]);
dit('... « garder » est un service : ni l’accord ni le « stop » ne le ferment', { bouton: true, ouvert: true },
  porte({ ...fk, genre: 'garder', modele: 'garder' }, { fiche: { ...fkSansAccord, stop: true }, nouvelles: { oui: false, par: 'stop' } }));

/* ── 3. La ligne : celle du passage, à la même clé, qui traverse les heures calmes ── */
const lSb = ligneDuMaintenant({ cerveau, situation: sb, reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT, qui: 'Yéman' })!;
const duPassage = lignesDuPassage({ cerveau, plan: [sb], reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT }).find((l) => l.clientId === 'sb')!;
const sauf = (l: Record<string, unknown>, cles: string[]) => Object.fromEntries(Object.entries(l).filter(([k]) => !cles.includes(k)));
const HEURE = ['partA', 'calme', 'parLaMain', 'envoyeMaintenantPar', 'envoyeMaintenantLe'];
dit('la ligne envoyée maintenant est celle du passage : même clé gerard-<jour>-<cliente>-whatsapp, même modèle, mêmes variables, même image, mêmes boutons', [`gerard-${D}-sb-whatsapp`, true, 'assistant_maison_anniversaire'],
  [lSb.id, JSON.stringify(sauf(lSb, HEURE)) === JSON.stringify(sauf(duPassage as unknown as Record<string, unknown>, HEURE)), lSb.colis?.genre === 'whatsapp' ? lSb.colis.modele : '']);
dit('... seule l’heure change : maintenant, en attente, une main l’a dit ; signée de qui a touché', ['en-attente', new Date(SOIR).toISOString(), false, true, 'Yéman'],
  [lSb.statut, lSb.partA, lSb.calme, lSb.parLaMain, lSb.envoyeMaintenantPar]);
dit('... le facteur la porte à 20 h 44, pendant les heures calmes ; la ligne du passage, elle, attendait le matin', [true, false],
  [peutPartir(lSb, SOIR + 30_000, REGLES_PAR_DEFAUT), peutPartir(duPassage, SOIR + 30_000, REGLES_PAR_DEFAUT)]);
dit('... la remise à son nom reste à faire au départ réel (jamais fabriquée au dépôt)', [true, undefined], [!!lSb.codeAFaire, (lSb as { codePromo?: string }).codePromo]);
dit('... rien ne part quand le passage ne la déposerait pas (modèle pas approuvé, sans numéro)', [null, null],
  [ligneDuMaintenant({ cerveau, situation: sb, reglagesGerard: { ...REGLAGES, approuves: [] }, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT, qui: 'Yéman' }),
    ligneDuMaintenant({ cerveau: { ...cerveau, telDe: () => '' }, situation: sb, reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT, qui: 'Yéman' })]);
const lFk = ligneDuMaintenant({ cerveau, situation: fk, reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT, qui: 'Yéman' })!;
const lNm = ligneDuMaintenant({ cerveau, situation: nm, reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT, qui: 'Yéman' })!;
dit('... les fêtes de FK. aussi : sa clé, sa situation ; la carte de NM. (« Non merci »), la carte seule', [`gerard-${D}-fk-whatsapp`, 'whatsapp', 'noel', `gerard-${D}-nm-whatsapp`, 'assistant_maison_carte_anniversaire'],
  [lFk.id, lFk.canal, lFk.genre, lNm.id, lNm.colis?.genre === 'whatsapp' ? lNm.colis.modele : '']);

/* ── 4. Le journal des gestes : qui a touché ── */
const g = gesteDuMaintenant(lSb, { mail: 'y@maison.test', nom: 'Yéman', porte: 'trone' }, 'SB X.');
dit('le geste s’inscrit au journal, signé : qui, par quelle porte, quelle ligne, posée', ['Yéman', 'y@maison.test', 'trone', 'pose', 'envois', lSb.id, 'Envoyé maintenant · Anniversaire · SB X.', lSb.envoyeMaintenantLe],
  [g.parNom, g.parMail, g.porte, g.verbe, g.table, g.pieceId, g.piece, g.quand]);

/* ── 5. Le passage suivant ne la renvoie pas ── */
const parti = (l: Record<string, unknown>, statut = 'envoyé') => ({ ...l, statut });
/* a. Le même jour : avant 8 h, sa clé l'écarte ; et le plan relu ne la redit plus. */
const existantes = new Set([lSb.id, lFk.id, lNm.id]);
dit('le même jour, le passage ne la redépose pas : sa clé est déjà au journal', [], lignesNeuves(lignesDuPassage({ cerveau, plan: [sb, fk, nm], reglagesGerard: REGLAGES, maintenantMs: SOIR, branchId: 'b', regles: REGLES_PAR_DEFAUT }), existantes).map((l) => l.id));
const memeJour = lisLAssistant(entrees({ envois: [nouvelle('sb', 16), lSb, lFk, lNm] }));
dit('... et le plan relu avec la ligne ne les redit plus (les deux cartes, les fêtes)', [false, false, false],
  ['sb', 'fk', 'nm'].map((id) => planDuJour(memeJour.fiches, memeJour.ctx).some((s) => s.clientId === id)));
/* b. Le lendemain, 8 h 15 : la carte se rattraperait (un jour de grâce), les fêtes ne viennent qu'une fois l'an. */
const LENDEMAIN = plusJours(D, 1);
const passageDuLendemain = (envoisEnPlus: unknown[]) => {
  const c = lisLAssistant(entrees({ aujourdhui: LENDEMAIN, maintenantMs: Date.parse(`${LENDEMAIN}T07:15:00Z`), envois: [nouvelle('sb', 16), ...envoisEnPlus] }));
  const p = planDuJour(c.fiches, c.ctx);
  const lignes = lignesNeuves(lignesDuPassage({ cerveau: c, plan: p, reglagesGerard: REGLAGES, maintenantMs: Date.parse(`${LENDEMAIN}T07:15:00Z`), branchId: 'b', regles: REGLES_PAR_DEFAUT }),
    new Set((envoisEnPlus as { id: string }[]).map((e) => e.id)));
  return { plan: p, lignes, c };
};
const sans = passageDuLendemain([]);
dit('sans le bouton, le lendemain, le passage déposerait les cartes de SB. et NM. (rattrapage) et une sollicitation à FK. : le banc voit bien ce qu’il faut empêcher', [true, true, true],
  ['sb', 'nm', 'fk'].map((id) => sans.lignes.some((l) => l.clientId === id)));
const LES_TROIS = ['sb', 'fk', 'nm'];
const apresEnvoi = passageDuLendemain([parti(lSb), parti(lFk), parti(lNm)]);
dit('le passage du lendemain ne renvoie ni les cartes ni les fêtes parties la veille au soir', [[], false],
  [apresEnvoi.lignes.filter((l) => LES_TROIS.includes(l.clientId)).map((l) => l.id), apresEnvoi.plan.some((s) => LES_TROIS.includes(s.clientId))]);
const enCours = passageDuLendemain([lSb, lFk, lNm]);
dit('... ni si la ligne attend encore le facteur au matin (en attente) : elle compte déjà', [],
  enCours.lignes.filter((l) => LES_TROIS.includes(l.clientId)).map((l) => l.id));
dit('... la carte de NM. (sa promesse à une seule nouvelle) est « déjà fêtée cette année » ; celle de SB. l’est aussi, et sa promesse est pleine', ['deja', 'deja'],
  ['nm', 'sb'].map((id) => anniversaireDuJour(ficheDe(apresEnvoi.c, id)!, apresEnvoi.c.ctx)?.etat));
const rate = passageDuLendemain([parti(lSb, 'échec'), parti(lFk, 'échec'), parti(lNm, 'échec')]);
dit('... une ligne que Meta n’a pas prise (échec) n’est pas partie : la carte se rattrape le lendemain, comme sans le bouton', [true, true],
  ['sb', 'nm'].map((id) => rate.lignes.some((l) => l.clientId === id)));

/* ── 6. La promesse des deux nouvelles par mois ── */
const fSb = ficheDe(cerveau, 'sb')!;
const fSbApres = ficheDe(memeJour, 'sb')!;
dit('la carte envoyée maintenant compte dans la promesse : une nouvelle ce mois avant, deux après', [1, 2, false],
  [promesseDe(fSb, D).deja, promesseDe(fSbApres, D).deja, promesseDe(fSbApres, D).tenue]);
const fFkApres = ficheDe(memeJour, 'fk')!;
dit('... les fêtes aussi : une de plus pour FK.', [0, 1], [promesseDe(ficheDe(cerveau, 'fk')!, D).deja, promesseDe(fFkApres, D).deja]);
const deux: TraceDeGerard[] = [
  { quand: `${plusJours(D, -20)}T09:00:00Z`, genre: 'envie', modele: 'envie' },
  { quand: `${plusJours(D, -16)}T09:00:00Z`, genre: 'envie', modele: 'envie' },
];
dit('le plafond tient : deux nouvelles déjà parties ce mois, le bouton se ferme, pour une sollicitation comme pour la carte', [
  { bouton: true, ouvert: false, raison: MOTIF_DE_LA_PROMESSE }, { bouton: true, ouvert: false, raison: MOTIF_DE_LA_PROMESSE }],
[porte(fk, { fiche: { ...ficheDe(cerveau, 'fk')!, traces: deux } }), porte(sb, { fiche: { ...fSb, traces: deux } })]);
dit('... et la troisième n’entre même pas au plan : la carte attend, son état dit la promesse', false,
  planDuJour(lisLAssistant(entrees({ envois: [nouvelle('sb', 20, 1), nouvelle('sb', 16, 2)] })).fiches, cerveau.ctx).some((s) => s.clientId === 'sb'));
dit('... « garder » ne compte jamais : il reste ouvert à deux nouvelles', { bouton: true, ouvert: true },
  porte({ ...fk, genre: 'garder', modele: 'garder' }, { fiche: { ...ficheDe(cerveau, 'fk')!, traces: deux } }));

/* ── 7. Aujourd'hui, la ligne dit qu'elle part à l'instant ── */
const ctxF: Pick<ContexteDeGerard, 'aujourdhui'> = { aujourdhui: D };
const fusion = fusionnePlanEtSalle({ plan: [sb, fk], envois: [lSb, lFk] as unknown as EnvoiDuJour[], aujourdhui: ctxF.aujourdhui, maintenantMs: SOIR + 10_000, actif: true, partSeule: () => true });
dit('Aujourd’hui : envoyées maintenant, la carte et les fêtes sont en salle et « part à l’instant », jamais « au passage du matin »', [['en-salle', 'part à l’instant'], ['en-salle', 'part à l’instant']],
  fusion.lignes.map((l) => [l.etat, l.depart]));

/* ── 8. La lettre : l'écran, le dépôt, le facteur ── */
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/clients/Gerard.tsx', 'utf8'));
dit('l’écran : le bouton naît de la porte, sur la ligne sans envoi, ouvert il envoie, fermé il dit sa raison', [true, true, true, true, true],
  [/porteDuMaintenant\(\{\s*situation: s, reglagesGerard: brut, dejaUneLigne: !!l\.envoi,/.test(ecran),
    /\{porteMaintenant\.bouton && \(porteMaintenant\.ouvert \? \(/.test(ecran),
    /onClick=\{\(\) => \{ void envoieSansAttendre\(s\); \}\}>\s*\{enVol === s\.clientId \? 'Envoi en cours' : 'Envoyer maintenant'\}/.test(ecran),
    /disabled title=\{`Fermé : \$\{porteMaintenant\.raison\}\.`\}>Envoyer maintenant<\/button>/.test(ecran),
    /Envoyer maintenant est fermé : \{porteMaintenant\.raison\}\./.test(ecran)]);
dit('... le toucher passe par le dépôt, et la clé déjà prise part par le geste de la salle', [true, true],
  [/envoieLaLigneMaintenant\(\{ cerveau, situation: s, reglagesGerard: brut, branchId: branch\.id, regles, qui \}\)/.test(ecran),
    /if \(issue === 'deja'\) \{\s*const v = await gesteDeLaSalle\(id, 'envoyer', qui, regles\);/.test(ecran)]);
const depot = sansCommentaires(readFileSync('src/apps/trone/routes/clients/envoyer-maintenant.ts', 'utf8'));
dit('le dépôt : le facteur vivant d’abord, la ligne insérée (jamais écrasée : une ligne partie ne redevient pas « en attente »), la clé prise dite, le geste au journal', [true, true, false, true, true],
  [/if \(!facteurVivant\(/.test(depot), /\.from\('envois'\)\.insert\(\{ id, branch_id: ligne\.branchId, data: ligne \}\)/.test(depot), /\.upsert\(/.test(depot),
    /code !== '23505'\) return \{ issue: 'panne', id \}/.test(depot), /void inscrisLesGestes\(\[gesteDuMaintenant\(ligne, identiteCourante\(\),/.test(depot)]);
const facteur = readFileSync('supabase/functions/envois-partent/index.ts', 'utf8');
dit('le facteur : une main qui a dit « maintenant » traverse les heures calmes, et la porte d’avance (arrêt de la direction, modèle en pause) la juge quand même', [true, true],
  /* 21 novembre 2026 : l'équipe du matin traverse aussi les heures calmes. */
  [/\(!calme \|\| l\.data\.parLaMain === true \|\| l\.data\.type === TYPE_PROGRAMME(?: \|\| l\.data\.type === TYPE_DE_L_EQUIPE_DU_MATIN)?\)/.test(facteur), /const dAvance = laPorteDAvance\(devant, avance\);/.test(facteur)]);

console.log(ko ? `\n${ko} ECHEC(S)` : '\nTout passe.');
process.exitCode = ko ? 1 : 0;
