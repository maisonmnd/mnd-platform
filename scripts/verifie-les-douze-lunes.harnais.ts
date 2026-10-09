import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FORME_DU_CODE, codeDeMarraine, prenomDuNom, type SoinOffert } from '../src/shared/parrainage-pur';
import { codesAAttribuer, type FicheLue } from '../src/shared/parrainage';
import {
  lignees, recompensesAPoser, reglageDuMoteur, resumeDeLAmbassade, rattachementsDuSite,
  type DemandeLue, type FicheAmb, type RdvLu, type ReglageAmbassade,
} from '../src/shared/ambassade';
import {
  PLAFOND_SANS_MAIN, attendLeLancement, classeDeLaRecompense, codeActifDe, codeDeLaCarte, codesConnus, ficheLancee, ficheRendue,
  grainesAAttribuer, hasardDe, joursDesLunes, merciDuLancement, perteDuRetour, planDuLancement, reglageEteint, reglageRendu,
  resteAvantLaGraine, resteDuLancement, retourPossible, seuilDeLaGraine,
  visitesDesLunes, type Graine, type ReglageDesLunes,
} from '../src/shared/douze-lunes-pur';
import { mercisDesGraines, mercisDuLancement } from '../src/apps/trone/routes/equipe/lancement';
import { memeContenu } from '../src/shared/meme-contenu';
import { etapesDeLEffet, sansCommentaires, unGesteParPassage } from './un-geste-par-passage';

/* DE MAIN EN MAIN, EPROUVE — 9 octobre 2026.

   Le nouveau programme d'ambassadrices de la Maison (phase 1) : la carte ne
   se donne plus a toutes, elle se GAGNE. A sa Neme visite honoree depuis le
   1er janvier 2026, une cliente devient Graine ; seul le code de sa Graine
   ouvre quelque chose ; l'ancien programme (codes pour toutes, echo, rangs
   recompenses, defi, classement dans Ma Couronne) s'eteint, et son archive
   permet de revenir en arriere. Les decisions de la direction (9 octobre) :
   une visite est un JOUR ; aucune exclusion ; les recompenses de l'ancien
   programme partent toutes, utilisees et expirees comprises (le Foyer
   reste) ; une amie invitee avant le lancement et venue apres vaut son merci
   a sa marraine devenue Graine ; le classement reste au personnel ; Ma
   Couronne titre « De main en main » ; le site ne dit pas N.

   Chaque regle porte une PROMESSE, ecrite ici a la main, et ses PANNES :
   des mutations du texte d'un fichier du depot (le juge pur, le moteur, le
   crochet, Ma Couronne, l'Edge, la migration, une page generee).

   `node scripts/verifie-les-douze-lunes.mjs`           eprouve le depot
   `node scripts/verifie-les-douze-lunes.mjs --prouve`  rejoue chaque regle
   avec chacune de ses pannes injectee (a la construction pour le code
   empaquete, a la lecture pour les textes) : elle DOIT crier, sinon le
   harnais crie. Une mutation introuvable fait elle-meme echouer le harnais :
   une panne qui ne s'applique plus ne prouve plus rien.

   Lance apres genere-revelateur (la regle du site lit les pages ecrites).
   Sortie ASCII : OK / RATE. */

type Mutation = { fichier: string; avant: string; apres: string };
type Panne = { nom: string; mute: Mutation[] };
type Regle = { id: string; nom: string; eprouve: () => string[] | Promise<string[]>; pannes: Panne[] };

/* ── Les outils du juge ─────────────────────────────────────────────── */
const lit = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const lf = (s: string): string => s.replace(/\r\n/g, '\n');
const j = (v: unknown): string => JSON.stringify(v);
function juge() {
  const ecarts: string[] = [];
  const vaut = (nom: string, attendu: unknown, obtenu: unknown) => {
    if (j(attendu) !== j(obtenu)) ecarts.push(`${nom} : attendu ${j(attendu)}, obtenu ${j(obtenu)}`);
  };
  const vrai = (nom: string, v: boolean) => { if (!v) ecarts.push(nom); };
  return { ecarts, vaut, vrai };
}
const sqlSansCommentaires = (s: string): string => s.replace(/--.*$/gm, '');
const MIGRATIONS = 'supabase/migrations';
const migrations = (): { nom: string; sql: string }[] => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  .map((nom) => ({ nom, sql: sqlSansCommentaires(lf(readFileSync(`${MIGRATIONS}/${nom}`, 'utf8'))) }));
const EDGE = 'supabase/functions/demande-submit/index.ts';
const POUR = 'src/shared/douze-lunes-pur.ts';
const MOTEUR = 'src/shared/ambassade.ts';
const CROCHET = 'src/apps/trone/shell/useParrainageVivant.ts';
const CARTE = 'src/apps/couronne/MaCarte.tsx';
const ONGLETS = 'src/apps/couronne/Tabs.tsx';
const M0124 = 'supabase/migrations/0124_les_douze_lunes.sql';
const GESTE = 'src/apps/trone/routes/equipe/lancement.ts';
const FENETRE = 'src/apps/trone/routes/equipe/LancementDesDouzeLunes.tsx';
const PARRAINAGES = 'src/apps/trone/routes/equipe/Parrainages.tsx';
const RESERVER = 'src/apps/revelateur/ilots/Reserver.tsx';
const RAPPEL = 'src/apps/revelateur/ilots/Demande.tsx';
/** La fonction qui suit `debut` dans un texte, jusqu'à la suivante. */
const fonction = (src: string, debut: string, fin: string): string => {
  const i = src.indexOf(debut);
  if (i < 0) return '';
  const k = src.indexOf(fin, i + debut.length);
  return src.slice(i, k < 0 ? undefined : k);
};

/* ── Le banc : des dates, des fiches ─────────────────────────────────── */
const AUJ = '2026-10-20';
const AUJ_PLUS_UN_AN = '2027-10-20';
const LANCE = '2026-10-09';
const LANCE_INSTANT = '2026-10-09T20:00:00.000Z';
const CINQ = ['2026-01-15', '2026-03-02', '2026-05-04', '2026-07-06', '2026-09-08'];
let numero = 0;
const rdv = (clientId: string | undefined, date: string, status = 'honoré', id?: string): RdvLu =>
  ({ id: id ?? `r${String(++numero).padStart(4, '0')}`, status, date, ...(clientId ? { clientId } : {}) });
const venues = (clientId: string, dates: readonly string[]): RdvLu[] => dates.map((d) => rdv(clientId, d));
const fiche = (o: Partial<FicheAmb> & { id: string } & Record<string, unknown>): FicheAmb =>
  ({ name: 'X', phone: '+2290100000000', since: '2024-01-01', ...o } as FicheAmb);
const graineDe = (code: string, atteinteLe = '2026-09-08'): Graine => ({ code, le: LANCE, atteinteLe, seuil: 5 });
const soin = (id: string, o: Partial<SoinOffert> = {}): SoinOffert => ({ id, libelle: 'Un soin offert', raison: 'Banc', poseLe: '2026-08-01', ...o });
const LUNES: ReglageDesLunes = { seuilGraine: 5, lanceLe: LANCE_INSTANT };
/** UN REGLAGE PERIME : l'ancien programme encore allume dans le document. */
const PERIME: ReglageAmbassade = {
  soinMarraineServiceId: 'svc-dandan', remisePct: 20, echoPct: 10, merciParWhatsApp: true,
  bonusRangs: { tresse: 'svc-signature', couronne: 'svc-signature', reine: 'svc-signature' },
  defi: { actif: true, objectif: 1, serviceId: 'svc-defi' },
};

/** Ce que le crochet ecrit sur une fiche qui recoit sa Graine. */
const appliqueLesGraines = (fiches: readonly FicheAmb[], graines: readonly { clientId: string; graine: Graine }[]): FicheAmb[] => {
  const parFiche = new Map(graines.map((g) => [g.clientId, g.graine]));
  return fiches.map((c) => {
    const g = parFiche.get(c.id);
    return g && !c.graine && !attendLeLancement(c) ? { ...c, graine: g, codeParrain: g.code } : c;
  });
};

/** UN PASSAGE DU CROCHET (useParrainageVivant), rejoue sur les VRAIS juges :
    rattachement, Graines (apres le lancement, sous le plafond), resumes,
    mercis. Un geste par passage ; `null` quand plus rien ne change. */
function passage(fiches: FicheAmb[], rdvs: RdvLu[], demandes: DemandeLue[], lunes: ReglageDesLunes, reglage: ReglageAmbassade, aujourdhui: string): FicheAmb[] | null {
  const rattache = rattachementsDuSite(fiches, demandes, rdvs);
  if (rattache.length) {
    const m = new Map(rattache.map((r) => [r.clientId, r]));
    return fiches.map((c) => { const r = m.get(c.id); return r && !c.parraineePar ? { ...c, parraineePar: r.code, parraineeLe: r.le } : c; });
  }
  const reglageAmb: ReglageAmbassade = { ...reglage, lanceLe: lunes.lanceLe ? lunes.lanceLe.slice(0, 10) : undefined };
  if (lunes.lanceLe) {
    const graines = grainesAAttribuer(fiches.filter((c) => !attendLeLancement(c)), rdvs, seuilDeLaGraine(lunes), aujourdhui, codesConnus(fiches, demandes), new Set());
    if (graines.length > 0 && graines.length <= PLAFOND_SANS_MAIN) return appliqueLesGraines(fiches, graines);
  }
  const L = lignees(fiches, demandes, rdvs);
  const resumes = new Map<string, ReturnType<typeof resumeDeLAmbassade>>();
  for (const c of fiches) {
    const code = codeActifDe(c);
    const l = code ? L.get(code) : undefined;
    if (!l) continue;
    const r = resumeDeLAmbassade(l, L, fiches, reglageAmb, aujourdhui);
    if (!memeContenu(r, c.parrainage ?? null)) resumes.set(c.id, r);
  }
  if (resumes.size) return fiches.map((c) => (resumes.has(c.id) ? { ...c, parrainage: resumes.get(c.id) } : c));
  const poses = recompensesAPoser(fiches, L, reglageAmb, aujourdhui);
  if (poses.parFiche.size) {
    return fiches.map((c) => {
      const neuves = (poses.parFiche.get(c.id) ?? []).filter((s) => !(c.soinsOfferts ?? []).some((x) => x.id === s.id));
      return neuves.length ? { ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...neuves] } : c;
    });
  }
  return null;
}
function stabilise(fiches: FicheAmb[], rdvs: RdvLu[], demandes: DemandeLue[], lunes: ReglageDesLunes, reglage: ReglageAmbassade, aujourdhui: string): FicheAmb[] {
  let f = fiches;
  for (let i = 0; i < 40; i++) {
    const s = passage(f, rdvs, demandes, lunes, reglage, aujourdhui);
    if (!s) return f;
    f = s;
  }
  throw new Error('le crochet ne se stabilise pas en quarante passages');
}
const ce = (fiches: readonly FicheAmb[]) => fiches.map((c) => ({
  id: c.id, graine: c.graine ?? null, code: codeActifDe(c), rang: c.parrainage?.rang ?? null, soins: (c.soinsOfferts ?? []).map((s) => s.id),
}));

/* ── R1 : le banc du seuil ── */
const r1Fiches = [
  fiche({ id: 'a3', name: 'Iya A' }), fiche({ id: 'a4', name: 'Abla B' }), fiche({ id: 'a5', name: 'Afi C' }),
  fiche({ id: 'bord', name: 'Bella D' }), fiche({ id: 'stat', name: 'Celine E' }), fiche({ id: 'dina', name: 'Dina F' }),
  fiche({ id: 'dina-fille', name: 'Dora F', familyId: 'fam-dina' }), fiche({ id: 'demain', name: 'Edwige G' }),
  /* Une tete dependante (enfant, foyer) : aucune exclusion, decision 2. */
  fiche({ id: 'enfant', name: 'Hawa H', familyId: 'fam-dina', dateOfBirth: '2016-04-01' }),
  fiche({ id: 'jour', name: 'Fanta I' }), fiche({ id: 'arch', name: 'Gisele J', archived: true }),
];
const r1Rdvs: RdvLu[] = [
  ...venues('a3', ['2026-02-01', '2026-04-01', '2026-06-01']),
  ...venues('a4', CINQ.slice(0, 4)),
  ...venues('a5', CINQ),
  ...venues('bord', ['2025-12-31', '2026-01-01', '2026-02-02', '2026-03-03', '2026-04-04']),
  ...venues('stat', CINQ.slice(0, 4)), rdv('stat', '2026-10-01', 'confirmé'), rdv('stat', '2026-08-01', 'annulé'),
  ...venues('dina', CINQ.slice(0, 4)), rdv('dina-fille', '2026-09-08'),
  ...venues('demain', CINQ.slice(0, 4)), rdv('demain', '2026-10-21'),
  ...venues('enfant', CINQ),
  ...venues('jour', ['2026-01-15', '2026-03-02', '2026-03-02', '2026-05-04', '2026-07-06']),
  ...venues('arch', [...CINQ, '2026-10-01']),
];

/* ── R2 : une foule qui portait les codes de l'ancien programme ── */
const foule = Array.from({ length: 40 }, (_, i) => fiche({ id: `c${String(i).padStart(3, '0')}`, name: i % 2 ? 'Aïcha Test' : 'Grâce', phone: `+22901${String(10000000 + i)}` }));
const anciensCodes = codesAAttribuer(foule as unknown as FicheLue[], []);
const ancienDe = new Map(anciensCodes.map((a) => [a.clientId, a.code]));
const fouleAvant = foule.map((f) => ({ ...f, codeParrain: ancienDe.get(f.id) }));
const premierDe = (id: string, nom: string): string => codeDeMarraine(prenomDuNom(nom), hasardDe(`lunes:${id}:0`));
/* Quatre fiches dont le PREMIER tirage tombe sur un code deja vu ailleurs :
   dans une demande du site, dans l'archive d'une autre, dans le lien d'une
   amie, sur une fiche archivee. */
const pieges = [
  { id: 'p1', name: 'Yasmine K' }, { id: 'p2', name: 'Sena L' }, { id: 'p3', name: 'Kafui M' }, { id: 'p4', name: 'Mawu N' },
].map((p) => ({ ...p, premier: premierDe(p.id, p.name) }));
const r2Fiches: FicheAmb[] = [
  ...fouleAvant,
  ...pieges.map((p) => fiche({ id: p.id, name: p.name })),
  fiche({ id: 'z-archive', name: 'Zou O', graine: graineDe('ZOU-Q2X'), codeParrain: 'ZOU-Q2X', avantLesDouzeLunes: { le: LANCE_INSTANT, codeParrain: pieges[1].premier, soinsRetires: [] } }),
  fiche({ id: 'z-lien', name: 'Zara P', parraineePar: pieges[2].premier }),
  fiche({ id: 'z-morte', name: 'Zita Q', archived: true, codeParrain: pieges[3].premier }),
];
const r2Demandes = [{ id: 'd-site', prenom: 'Fifi', codeParrain: 'RAMA-4HX', parrainDe: pieges[0].premier }];
const r2Rdvs: RdvLu[] = [...foule, ...pieges].flatMap((f) => venues(f.id, CINQ));

/* ── R4 : une Maison telle qu'avant le geste ── */
const r4Fiches: FicheAmb[] = [
  fiche({
    id: 'adjoa', name: 'Adjoa Mensah', codeParrain: 'ADJOA-K7M',
    parrainage: { filleules: [{ prenom: 'Rama', etat: 'venue', date: '2026-08-01' }], venues: 1, rang: 'pousse', defi: { mois: '2026-09', objectif: 2, fait: 1, libelle: 'x' } } as never,
    soinsOfferts: [
      soin('parr-d1', { raison: 'Pour la venue de Rama' }),
      soin('foyer-s1-fam1', { source: 'foyer', genre: 'soin' }),
      soin('echo-parr-c-ines', { source: 'echo', genre: 'remise', pct: 10, utiliseLe: '2026-09-20', piece: 'F-2026-0012' }),
      soin('rang-tresse-adjoa', { source: 'rang', expireLe: '2026-09-01' }),
      soin('defi-2026-09-adjoa', { source: 'defi' }),
      soin('s-amie-7', { source: 'amie', genre: 'a-choisir' }),
      soin('foyer-s2-fam9'),
      soin('geste-de-la-main'),
    ],
  }),
  /* Toute fiche avait un code : l'amie aussi. Son lien reste (decision 5). */
  fiche({ id: 'grace', name: 'Grâce H', codeParrain: 'GRACE-4JN', parraineePar: 'ADJOA-K7M', parraineeLe: '2026-08-01' }),
  fiche({ id: 'lea', name: 'Léa T', archived: true, codeParrain: 'LEA-2WX', soinsOfferts: [soin('parr-c-zoe', { source: 'amie' })] }),
  fiche({ id: 'neuve', name: 'Neuve U' }),
  fiche({ id: 'yao', name: 'Yao K', codeParrain: 'YAO-7HP', soinsOfferts: [soin('foyer-s3-fam3', { source: 'foyer' })] }),
];
const r4Rdvs: RdvLu[] = [...venues('adjoa', CINQ), ...venues('grace', ['2026-08-01'])];
const r4Demandes = [{ id: 'd-marraine', prenom: 'Fifi', codeParrain: 'FIFI-Q3R' }];

/* ── R5 : une Maison apres le geste ── */
const ARCHIVE_ADJOA = { le: LANCE_INSTANT, codeParrain: 'ADJOA-K7M', soinsRetires: [soin('parr-c-sika', { source: 'amie', poseLe: LANCE })] };
const r5Fiches: FicheAmb[] = [
  fiche({ id: 'adjoa', name: 'Adjoa Mensah', phone: '+2290170000000', graine: graineDe('ADJOA-Q2X'), codeParrain: 'ADJOA-Q2X', avantLesDouzeLunes: ARCHIVE_ADJOA }),
  /* Venue AVANT le lancement, invitee par l'ancien code : pas de merci. */
  fiche({ id: 'grace', name: 'Grâce H', graine: graineDe('GRACE-9MT'), codeParrain: 'GRACE-9MT', parraineePar: 'ADJOA-K7M', avantLesDouzeLunes: { le: LANCE_INSTANT, codeParrain: 'GRACE-4JN', soinsRetires: [] } }),
  /* Invitee avant le lancement (ancien code), venue apres : son merci (decision 5). */
  fiche({ id: 'kofi', name: 'Kofi A', parraineePar: 'ADJOA-K7M' }),
  fiche({ id: 'rama', name: 'Rama D', parraineePar: 'ADJOA-Q2X' }),
  /* Venue le jour du lancement ; son merci est deja dans l'archive. */
  fiche({ id: 'sika', name: 'Sika B', parraineePar: 'ADJOA-K7M' }),
  fiche({ id: 'zoe', name: 'Zoé A', parraineePar: 'ADJOA-Q2X' }),
  fiche({ id: 'ines', name: 'Inès K', graine: graineDe('INES-W4R'), codeParrain: 'INES-W4R', parraineePar: 'GRACE-9MT' }),
  fiche({ id: 'lea', name: 'Léa T', parraineePar: 'INES-W4R' }),
  /* Lancee sans Graine : son ancien code ne mene nulle part. */
  fiche({ id: 'yao', name: 'Yao K', avantLesDouzeLunes: { le: LANCE_INSTANT, codeParrain: 'YAO-7HP', soinsRetires: [] } }),
  fiche({ id: 'awa', name: 'Awa H', parraineePar: 'YAO-7HP' }),
  /* Un ancien code reste sur une fiche que le geste n'a pas encore rangee. */
  fiche({ id: 'vieux', name: 'Vieux P', codeParrain: 'VIEUX-3PQ' }),
  fiche({ id: 'bio', name: 'Bio Q', parraineePar: 'VIEUX-3PQ' }),
  fiche({ id: 'abla', name: 'Abla B' }),
];
const r5Rdvs: RdvLu[] = [
  rdv('grace', '2026-09-20', 'honoré', 'a-grace'), rdv('kofi', '2026-10-12', 'honoré', 'a-kofi'), rdv('rama', '2026-10-15', 'honoré', 'a-rama'),
  rdv('sika', LANCE, 'honoré', 'a-sika'), rdv('zoe', '2026-10-30', 'confirmé', 'a-zoe'), rdv('ines', '2026-10-11', 'honoré', 'a-ines'),
  rdv('lea', '2026-10-13', 'honoré', 'a-lea'), rdv('awa', '2026-10-12', 'honoré', 'a-awa'), rdv('bio', '2026-10-12', 'honoré', 'a-bio'),
  rdv(undefined, '2026-10-14', 'honoré', 'a-nadia'), rdv(undefined, '2026-10-16', 'honoré', 'a-tard'),
  ...venues('abla', CINQ.slice(0, 4)),
];
const r5Demandes: DemandeLue[] = [
  /* Reservee sur le site AVANT le lancement avec l'ancien code, venue apres. */
  { id: 'd-nadia', prenom: 'Nadia', telephone: '+2290176000000', createdAt: '2026-10-01T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-K7M', apptId: 'a-nadia' },
  /* APRES le lancement, l'ancien code : l'Edge ne le reconnait plus. */
  { id: 'd-tard', prenom: 'Tard', telephone: '+2290177000000', createdAt: '2026-10-15T09:00:00Z', codeRaison: 'inconnu', apptId: 'a-tard' },
];

/* ── R6 : deux mondes, l'un avec une descendance de plus ── */
const r6Base: FicheAmb[] = [
  fiche({ id: 'adjoa', name: 'Adjoa Mensah', graine: graineDe('ADJOA-Q2X'), codeParrain: 'ADJOA-Q2X' }),
  fiche({ id: 'grace', name: 'Grâce H', graine: graineDe('GRACE-9MT'), codeParrain: 'GRACE-9MT', parraineePar: 'ADJOA-Q2X' }),
  fiche({ id: 'rama', name: 'Rama D', parraineePar: 'ADJOA-Q2X' }),
  fiche({ id: 'kofi', name: 'Kofi A', parraineePar: 'ADJOA-Q2X' }),
];
const r6Descendance: FicheAmb[] = [
  fiche({ id: 'ines', name: 'Inès K', graine: graineDe('INES-W4R'), codeParrain: 'INES-W4R', parraineePar: 'GRACE-9MT' }),
  fiche({ id: 'nora', name: 'Nora E', parraineePar: 'GRACE-9MT' }),
  fiche({ id: 'lea', name: 'Léa T', graine: graineDe('LEA-2WX'), codeParrain: 'LEA-2WX', parraineePar: 'INES-W4R' }),
  fiche({ id: 'mila', name: 'Mila F', parraineePar: 'LEA-2WX' }),
];
const r6Rdvs: RdvLu[] = [
  rdv('grace', '2026-10-11'), rdv('rama', '2026-10-12'), rdv('kofi', '2026-10-13'),
  rdv('ines', '2026-10-14'), rdv('nora', '2026-10-15'), rdv('lea', '2026-10-16'), rdv('mila', '2026-10-17'),
];

/* ── Les pannes du code (mutations du texte source) ── */
const P = (fichier: string, avant: string, apres: string): Mutation => ({ fichier, avant, apres });
const PANNE_ECHO: Panne = {
  nom: 'le bloc echo remis dans le moteur',
  mute: [P(MOTEUR, '    if (neuves.length) poses.parFiche.set(c.id, neuves);',
    '    for (const { f } of echosDe(l, L, codesActifsParFiche(clients))) {\n'
    + '      const id = `echo-${f.recompenseId}`;\n'
    + '      if (deja.has(id)) continue;\n'
    + '      deja.add(id);\n'
    + "      neuves.push({ id, genre: 'remise', libelle: 'Une remise', raison: `Echo de ${f.prenom}`, poseLe: aujourdhui, expireLe, source: 'echo', pct: 10 });\n"
    + '    }\n'
    + '    if (neuves.length) poses.parFiche.set(c.id, neuves);')],
};
const PANNE_GLISSANTE: Panne = {
  nom: 'les visites comptees sur douze mois glissants (venuesDeLAnnee)',
  mute: [P(POUR, 'return jour >= DEBUT_DES_LUNES && jour <= aujourdhui;', 'return jour > `${Number(aujourdhui.slice(0, 4)) - 1}${aujourdhui.slice(4)}` && jour <= aujourdhui;')],
};

const regles: Regle[] = [
  /* ══ R1 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R1', nom: 'R1 le seuil de la Graine : N jours honores depuis le 1er janvier 2026, aucune exclusion',
    eprouve: () => {
      const { ecarts, vaut } = juge();
      vaut('les visites de chaque fiche', { a3: 3, a4: 4, a5: 5, bord: 4, stat: 4, dina: 4, 'dina-fille': 1, demain: 4, enfant: 5, jour: 4, arch: 6 },
        Object.fromEntries(r1Fiches.map((f) => [f.id, visitesDesLunes(r1Rdvs, f.id, AUJ)])));
      vaut('le 2025-12-31 ne compte pas, le 2026-01-01 compte', '2026-01-01', joursDesLunes(r1Rdvs, 'bord', AUJ)[0]);
      const n5 = grainesAAttribuer(r1Fiches, r1Rdvs, 5, AUJ);
      vaut('N=5 : quatre jours ne font pas de Graine, cinq en font une (un enfant aussi)', ['a5', 'enfant'], n5.map((g) => g.clientId));
      vaut('la Graine porte le jour de la Neme visite, le jour de sa pose et N', { atteinteLe: '2026-09-08', le: AUJ, seuil: 5 },
        { atteinteLe: n5[0]?.graine.atteinteLe, le: n5[0]?.graine.le, seuil: n5[0]?.graine.seuil });
      vaut('N=3 : trois visites suffisent (l archivee jamais)', ['a3', 'a4', 'a5', 'bord', 'demain', 'dina', 'enfant', 'jour', 'stat'],
        grainesAAttribuer(r1Fiches, r1Rdvs, 3, AUJ).map((g) => g.clientId));
      vaut('N se borne : absent ou abime vaut 5, jamais plus de 20', [5, 5, 3, 20], [seuilDeLaGraine(undefined), seuilDeLaGraine({ seuilGraine: 0 }), seuilDeLaGraine({ seuilGraine: 3 }), seuilDeLaGraine({ seuilGraine: 40 })]);
      vaut('le reste avant la Graine ne descend jamais sous zero', [3, 0, 0], [resteAvantLaGraine(2, 5), resteAvantLaGraine(5, 5), resteAvantLaGraine(9, 5)]);
      return ecarts;
    },
    pannes: [
      { nom: '> a la place de >=', mute: [P(POUR, '(jours.get(f.id)?.length ?? 0) >= n)', '(jours.get(f.id)?.length ?? 0) > n)')] },
      PANNE_GLISSANTE,
      { nom: 'tout statut compte', mute: [P(POUR, "if (!r || r.status !== 'honoré') return false;", 'if (!r) return false;')] },
      { nom: 'pas de borne haute (un honore de demain compte)', mute: [P(POUR, 'return jour >= DEBUT_DES_LUNES && jour <= aujourdhui;', 'return jour >= DEBUT_DES_LUNES;')] },
      { nom: 'un rendez-vous, pas un jour', mute: [P(POUR, 'jours.add(r.date.slice(0, 10));', 'jours.add(`${r.date.slice(0, 10)}#${jours.size}`);')] },
      { nom: 'les rendez-vous d une autre tete comptent', mute: [P(POUR, 'if (r?.clientId === clientId && estUneVisiteDesLunes(r, aujourdhui))', 'if (estUneVisiteDesLunes(r, aujourdhui))')] },
      { nom: 'une archivee recoit sa Graine', mute: [P(POUR, '.filter((f) => f && !f.archived && !f.graine', '.filter((f) => f && !f.graine')] },
    ],
  },

  /* ══ R2 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R2', nom: 'R2 un code neuf : jamais un code deja vu, unique, le meme sur tous les postes',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const connus = codesConnus(r2Fiches, r2Demandes);
      vrai('le banc a bien ses anciens codes', anciensCodes.length === 40);
      vrai('codesConnus voit les codes des fiches, des archives, des Graines, des liens et des demandes',
        [ancienDe.get('c000')!, ...pieges.map((p) => p.premier), 'ZOU-Q2X', 'RAMA-4HX'].every((c) => connus.has(c)));
      const plan = planDuLancement(r2Fiches, r2Rdvs, r2Demandes, { seuilGraine: 5 }, LANCE);
      const initiales = plan.lignes.filter((l) => l.graine).map((l) => ({ clientId: l.clientId, code: l.graine!.code }));
      vaut('le geste pose une Graine a chaque fiche qui a ses cinq visites', 44, initiales.length);
      vaut('aucune ne reprend son ANCIEN code', [], initiales.filter((g) => g.code === ancienDe.get(g.clientId)).map((g) => g.clientId));
      vaut('aucune ne reprend un code deja vu ailleurs', [], initiales.filter((g) => connus.has(g.code)).map((g) => `${g.clientId}:${g.code}`));
      vaut('chacune a la forme PRENOM-XXX', [], initiales.filter((g) => !FORME_DU_CODE.test(g.code)).map((g) => g.code));
      vaut('aucune ne se repete, meme a vingt prenoms identiques', 44, new Set(initiales.map((g) => g.code)).size);
      vrai('le code vient du prenom', initiales.find((g) => g.clientId === 'c001')?.code.startsWith('AICHA-') === true);
      vaut('les pieges : le premier tirage, deja vu, est ecarte', [], pieges.filter((p) => initiales.find((g) => g.clientId === p.id)?.code === p.premier).map((p) => p.id));
      const melange = planDuLancement([...r2Fiches].reverse(), [...r2Rdvs].reverse(), r2Demandes, { seuilGraine: 5 }, LANCE);
      vaut('le meme resultat quel que soit l ordre de lecture', j(initiales), j(melange.lignes.filter((l) => l.graine).map((l) => ({ clientId: l.clientId, code: l.graine!.code }))));
      /* Apres le geste, le crochet tire les suivantes : l'ancien code est
         dans l'archive, il reste interdit. */
      const lancees = r2Fiches.map((f) => ficheLancee(f, null, LANCE_INSTANT));
      const suivantes = grainesAAttribuer(lancees, r2Rdvs, 5, AUJ, codesConnus(lancees, r2Demandes));
      vaut('apres le geste non plus, jamais l ancien code ni un code vu', [], suivantes.filter((g) => g.graine.code === ancienDe.get(g.clientId) || codesConnus(lancees, r2Demandes).has(g.graine.code)).map((g) => g.clientId));
      return ecarts;
    },
    pannes: [
      { nom: 'l ancien sel ${id}:${essai}, sans interdits', mute: [P(POUR, 'hasardDe(`lunes:${f.id}:${essai}`)', 'hasardDe(`${f.id}:${essai}`)'), P(POUR, 'const pris = new Set(interdits);', 'const pris = new Set<string>();')] },
      { nom: 'les interdits ignores', mute: [P(POUR, 'const pris = new Set(interdits);', 'const pris = new Set<string>();')] },
      { nom: 'codesConnus oublie les demandes du site', mute: [P(POUR, 'ajoute(d.parrainDe);', '')] },
      { nom: 'codesConnus oublie les archives', mute: [P(POUR, 'ajoute(f.avantLesDouzeLunes?.codeParrain);', '')] },
      { nom: 'codesConnus oublie les liens des amies', mute: [P(POUR, 'ajoute(f.parraineePar);', '')] },
    ],
  },

  /* ══ R3 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R3', nom: 'R3 la Graine est une decision : ni N releve ni une visite annulee ne la reprennent',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const avant = [fiche({ id: 'g1', name: 'Afi C' }), fiche({ id: 'g2', name: 'Abla B' })];
      const rdvs = [...venues('g1', CINQ), ...venues('g2', CINQ.slice(0, 4))];
      const posees = appliqueLesGraines(avant, grainesAAttribuer(avant, rdvs, 5, '2026-09-10'));
      const g1 = posees.find((f) => f.id === 'g1')!;
      vrai('le banc a sa Graine', !!g1.graine && codeActifDe(g1) === g1.graine.code);
      const releve = stabilise(posees, rdvs, [], { ...LUNES, seuilGraine: 8 }, {}, AUJ);
      vaut('N releve a 8 : sa Graine et son code restent', [g1.graine, codeActifDe(g1)], (() => { const f = releve.find((x) => x.id === 'g1')!; return [f.graine, codeActifDe(f)]; })());
      const annulees = rdvs.map((r, i) => (r.clientId === 'g1' && i >= 3 ? { ...r, status: 'annulé' } : r));
      const apresAnnulation = stabilise(posees, annulees, [], LUNES, {}, AUJ);
      vaut('deux visites annulees apres coup : la Graine reste', g1.graine, apresAnnulation.find((x) => x.id === 'g1')!.graine);
      vaut('le juge ne repropose JAMAIS une fiche qui a sa Graine, meme a N=1', [], grainesAAttribuer(posees, rdvs, 1, AUJ).filter((g) => posees.find((f) => f.id === g.clientId)?.graine).map((g) => g.clientId));
      vrai('le geste du lancement rend une Graine telle quelle', ficheLancee(g1, { clientId: 'g1', graine: graineDe('AUTRE-Q2X') }, LANCE_INSTANT) === g1);
      /* Ma Couronne ne decide jamais : la carte s'ouvre sur la marque posee. */
      const carte = sansCommentaires(lit(CARTE));
      vrai('Ma Couronne : estGraine vient de la carte (client.graine), jamais des visites', /estGraine: !!donneesDeMaCarte\(client, !!lunes\.lanceLe\)/.test(carte));
      vrai('le crochet ne pose une Graine que sur une fiche qui n en a pas', /return g && !c\.graine && /.test(sansCommentaires(lit(CROCHET))));
      vrai('la main non plus (poseLesGraines)', /if \(!g \|\| c\.graine \|\| /.test(sansCommentaires(lit('src/apps/trone/routes/equipe/lancement.ts'))));
      return ecarts;
    },
    pannes: [
      { nom: 'la Graine recalculee a chaque passage', mute: [P(POUR, '.filter((f) => f && !f.archived && !f.graine && !exclues.has(f.id)', '.filter((f) => f && !f.archived && !exclues.has(f.id)')] },
      { nom: 'Ma Couronne deduit la Graine des visites', mute: [P(CARTE, 'estGraine: !!donneesDeMaCarte(client, !!lunes.lanceLe)', 'estGraine: visites >= seuil')] },
      { nom: 'le crochet repose une Graine sur une Graine', mute: [P(CROCHET, 'return g && !c.graine && !attendLeLancement(c)', 'return g && !attendLeLancement(c)')] },
    ],
  },

  /* ══ R4 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R4', nom: 'R4 le retrait : l ancien programme part dans l archive, le Foyer reste, l aller-retour rend tout',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      vaut('chaque recompense dans sa classe (utilisee et expiree retirees, decisions 3 et 4)',
        ['retiree', 'foyer', 'retiree', 'retiree', 'retiree', 'retiree', 'foyer', 'inconnue'],
        (r4Fiches[0].soinsOfferts ?? []).map((s) => classeDeLaRecompense(s)));
      const plan = planDuLancement(r4Fiches, r4Rdvs, r4Demandes, { seuilGraine: 5 }, LANCE);
      vaut('le plan nomme chaque fiche touchee (archivees comprises), pas les autres', ['adjoa', 'grace', 'lea', 'yao'], plan.lignes.map((l) => l.clientId));
      vaut('... et Adjoa, cinq visites, y recoit sa Graine initiale', ['adjoa'], plan.lignes.filter((l) => l.graine).map((l) => l.clientId));
      vaut('les inconnues sont gardees et montrees', ['geste-de-la-main'], plan.inconnues.map((i) => i.soin.id));
      vaut('les totaux disent les utilisees et les expirees retirees', { utilisees: 1, expirees: 1, foyer: 3 },
        { utilisees: plan.totaux.retireesUtilisees, expirees: plan.totaux.retireesExpirees, foyer: plan.totaux.gardeesFoyer });
      vaut('les marraines du site sont comptees, pas touchees', ['FIFI-Q3R'], plan.marrainesDuSite.map((m) => m.code));
      const ligneDe = new Map(plan.lignes.map((l) => [l.clientId, l]));
      const lancees = r4Fiches.map((f) => ficheLancee(f, ligneDe.get(f.id), LANCE_INSTANT));
      const A = lancees[0];
      vaut('Adjoa garde le Foyer et l inconnue, dans leur ordre', ['foyer-s1-fam1', 'foyer-s2-fam9', 'geste-de-la-main'], (A.soinsOfferts ?? []).map((s) => s.id));
      vaut('... son archive garde l ancien code, le resume et les cinq retirees', ['ADJOA-K7M', true, ['parr-d1', 'echo-parr-c-ines', 'rang-tresse-adjoa', 'defi-2026-09-adjoa', 's-amie-7']],
        [A.avantLesDouzeLunes?.codeParrain, !!A.avantLesDouzeLunes?.parrainage, (A.avantLesDouzeLunes?.soinsRetires ?? []).map((s) => s.id)]);
      vaut('... son code est celui de sa Graine, son resume est vide', [A.graine?.code, undefined], [A.codeParrain, A.parrainage]);
      vaut('Grace : son ancien code part, le lien vers sa marraine reste (decision 5)', [undefined, 'ADJOA-K7M', 'GRACE-4JN'],
        [lancees[1].codeParrain, lancees[1].parraineePar, lancees[1].avantLesDouzeLunes?.codeParrain]);
      vrai('une fiche sans ancien programme ne bouge pas', lancees[3] === r4Fiches[3]);
      vaut('rien ne reste a faire apres le geste, tout avant', [[], ['adjoa', 'grace', 'lea', 'yao']],
        [resteDuLancement(lancees, plan).map((l) => l.clientId), resteDuLancement(r4Fiches, plan).map((l) => l.clientId)]);
      vaut('L ALLER-RETOUR : ficheRendue(ficheLancee(f)) vaut f, pour chaque fiche', [],
        r4Fiches.filter((f, i) => !memeContenu(ficheRendue(lancees[i]), f)).map((f) => f.id));
      vaut('... l ordre des recompenses compris', (r4Fiches[0].soinsOfferts ?? []).map((s) => s.id), (ficheRendue(A).soinsOfferts ?? []).map((s) => s.id));
      vaut('la relance ne change rien (memes objets, meme a une autre heure)', [],
        lancees.filter((f) => ficheLancee(f, ligneDe.get(f.id), '2026-10-10T08:00:00.000Z') !== f).map((f) => f.id));
      /* Un vieux poste a repose l'ancien code sur une fiche rangee : la
         relance du geste ne reecrit JAMAIS l'archive (seul chemin du retour). */
      const yaoRepose = { ...lancees[4], codeParrain: 'YAO-7HP' };
      vaut('l archive ne se reecrit pas a la relance', lancees[4].avantLesDouzeLunes, ficheLancee(yaoRepose, ligneDe.get('yao'), '2026-10-11T08:00:00.000Z').avantLesDouzeLunes);
      return ecarts;
    },
    pannes: [
      { nom: 'classer par la source seulement', mute: [P(POUR, "  if (PREFIXE_RETIRE.test(id)) return 'retiree';\n", '')] },
      { nom: 'retirer le Foyer', mute: [P(POUR, "const SOURCES_RETIREES = new Set(['amie', 'echo', 'rang', 'defi']);", "const SOURCES_RETIREES = new Set(['amie', 'echo', 'rang', 'defi', 'foyer']);")] },
      { nom: 'garder les utilisees (l ancien defaut)', mute: [P(POUR, "  if (!s) return 'inconnue';", "  if (!s || (s as SoinOffert).utiliseLe) return 'inconnue';")] },
      { nom: 'garder les expirees', mute: [P(POUR, "  if (!s) return 'inconnue';", "  if (!s || ((s as SoinOffert).expireLe ?? '9999') < '2026-10-09') return 'inconnue';")] },
      { nom: 'reecrire l archive a la relance', mute: [P(POUR, 'if (!fiche || fiche.avantLesDouzeLunes || fiche.graine) return fiche;', 'if (!fiche || fiche.graine) return fiche;')] },
      { nom: 'vider le lien de l amie (parraineePar)', mute: [P(POUR, 'const { codeParrain: _code, parrainage: _resume, ...reste } = fiche;', 'const { codeParrain: _code, parrainage: _resume, parraineePar: _lien, ...reste } = fiche;')] },
    ],
  },

  /* ══ R5 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R5', nom: 'R5 le moteur apres le lancement : un merci par amie venue apres, rien d autre, malgre un reglage perime',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const L = lignees(r5Fiches, r5Demandes, r5Rdvs);
      const reglage: ReglageAmbassade = { ...PERIME, lanceLe: LANCE };
      vaut('une lignee ne nait que d une Graine', ['ADJOA-Q2X', 'GRACE-9MT', 'INES-W4R'], [...L.keys()].sort());
      vaut('Adjoa retrouve ses amies par son code ET par son ancien code (archive)', ['c:grace', 'c:kofi', 'c:rama', 'c:sika', 'c:zoe', 'd:d-nadia'],
        (L.get('ADJOA-Q2X')?.filleules ?? []).map((f) => f.cle).sort());
      const poses = recompensesAPoser(r5Fiches, L, reglage, AUJ);
      const idsDe = (id: string) => (poses.parFiche.get(id) ?? []).map((s) => s.id).sort();
      vaut('les mercis : venues apres le lancement seulement, l ancien code compris (decision 5)',
        { adjoa: ['parr-c-kofi', 'parr-c-rama', 'parr-d-nadia'], grace: ['parr-c-ines'], ines: ['parr-c-lea'] },
        Object.fromEntries([...poses.parFiche.keys()].sort().map((k) => [k, idsDe(k)])));
      vaut('aucun echo, aucun rang, aucun defi, malgre le reglage perime', [],
        [...poses.parFiche.values()].flat().filter((s) => /^(echo|rang|defi)-/.test(s.id) || s.source !== 'amie').map((s) => s.id));
      vaut('un remerciement par merci pose', 5, poses.mercis.length);
      vaut('la reservation du site recompensee est marquee', ['d-nadia'], poses.demandesMarquees);
      vaut('sans lancement : aucun merci', 0, recompensesAPoser(r5Fiches, L, { ...PERIME }, AUJ).parFiche.size);
      vaut('un lancement posterieur aux venues : aucun merci', 0, recompensesAPoser(r5Fiches, L, { ...PERIME, lanceLe: '2026-12-01' }, AUJ).parFiche.size);
      const resume = resumeDeLAmbassade(L.get('ADJOA-Q2X')!, L, r5Fiches, reglage, AUJ);
      vaut('le resume n a plus de defi ; les echos restent une ligne d honneur', [false, ['Inès via Grâce']], ['defi' in resume, (resume.echos ?? []).map((e) => `${e.prenom} via ${e.via}`)]);
      /* Les fiches rangees sans Graine : plus rien. */
      const sansGraine = planDuLancement(r4Fiches, r4Rdvs, [], { seuilGraine: 20 }, LANCE);
      const rangees = r4Fiches.map((f) => ficheLancee(f, sansGraine.lignes.find((l) => l.clientId === f.id), LANCE_INSTANT));
      const rdvsApres = [...r4Rdvs, rdv('grace', '2026-10-12')];
      const Lr = lignees(rangees, [], rdvsApres);
      vaut('sur des fiches rangees sans Graine : ni lignee, ni merci', [0, 0, 0], [Lr.size, recompensesAPoser(rangees, Lr, reglage, AUJ).parFiche.size, recompensesAPoser(rangees, Lr, reglage, AUJ).mercis.length]);
      /* Le chemin du site rejoint la fiche, par un code de Graine seulement. */
      const fichesSite = [...r5Fiches, fiche({ id: 'sena', name: 'Sena J' }), fiche({ id: 'ami', name: 'Ami L' })];
      const demandesSite: DemandeLue[] = [
        { id: 'd-sena', prenom: 'Sena', telephone: '1', createdAt: '2026-10-01T10:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-K7M', apptId: 'a-sena' },
        { id: 'd-ami', prenom: 'Ami', telephone: '2', createdAt: '2026-10-01T10:00:00Z', codeRaison: 'parrainage', parrainDe: 'YAO-7HP', apptId: 'a-ami' },
      ];
      const rdvsSite = [...r5Rdvs, rdv('sena', '2026-10-25', 'confirmé', 'a-sena'), rdv('ami', '2026-10-25', 'confirmé', 'a-ami')];
      vaut('le rattachement du site : l ancien code d une Graine oui, celui d une fiche sans Graine non', [{ clientId: 'sena', code: 'ADJOA-K7M' }],
        rattachementsDuSite(fichesSite, demandesSite, rdvsSite).map((r) => ({ clientId: r.clientId, code: r.code })));
      vrai('l ancien code d une fiche pas encore rangee ne fait pas de lignee', !L.has('VIEUX-3PQ'));
      return ecarts;
    },
    pannes: [
      PANNE_ECHO,
      { nom: 'le merci sans date metier', mute: [P(MOTEUR, '      if (!f.venueLe || f.venueLe.slice(0, 10) < lance) continue;', '      if (!f.venueLe) continue;')] },
      { nom: 'l ancien code ne mene plus a la Graine (decision 5 oubliee)', mute: [P(MOTEUR, '    if (actif && ancien && FORME_DU_CODE.test(ancien) && !vers.has(ancien)) vers.set(ancien, actif);', '')] },
      { nom: 'une lignee nee d un ancien code', mute: [P(MOTEUR, '    const code = codeActifDe(c);\n    if (!c || !code) continue;\n    res.set(code, {', '    const code = codeActifDe(c) ?? c?.codeParrain;\n    if (!c || !code) continue;\n    res.set(code, {')] },
      { nom: 'l archive oubliee : un merci deja recu revient', mute: [P(MOTEUR, 'const deja = new Set([...(c.soinsOfferts ?? []), ...(c.avantLesDouzeLunes?.soinsRetires ?? [])].map((s) => s?.id));', 'const deja = new Set([...(c.soinsOfferts ?? [])].map((s) => s?.id));')] },
      { nom: 'des mercis sans lancement', mute: [P(MOTEUR, '  if (!lance) return poses;\n', '')] },
    ],
  },

  /* ══ R6 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R6', nom: 'R6 les deux questions : ne rien amener ne fait rien perdre ; recruter ses recrues ne rapporte rien',
    eprouve: () => {
      const { ecarts, vaut } = juge();
      /* (a) A T, puis douze mois plus tard sans aucune amie de plus. */
      const aT = stabilise(r5Fiches, r5Rdvs, r5Demandes, LUNES, PERIME, AUJ);
      const unAnApres = stabilise(aT, r5Rdvs, r5Demandes, LUNES, PERIME, AUJ_PLUS_UN_AN);
      vaut('un an sans nouvelle amie : Graines, codes, rangs et recompenses ne bougent pas', [], ce(aT).filter((x, i) => j(x) !== j(ce(unAnApres)[i])).map((x) => x.id));
      vaut('... et le chemin vers la Graine ne se perd pas (Abla, quatre visites)', [4, 4], [visitesDesLunes(r5Rdvs, 'abla', AUJ), visitesDesLunes(r5Rdvs, 'abla', AUJ_PLUS_UN_AN)]);
      /* (b) La meme Adjoa, avec ou sans descendance de deuxieme et troisieme generation. */
      const monde = (fiches: FicheAmb[]) => {
        const L = lignees(fiches, [], r6Rdvs);
        const reglage = { ...PERIME, lanceLe: LANCE };
        return {
          recompenses: (recompensesAPoser(fiches, L, reglage, AUJ).parFiche.get('adjoa') ?? []).map((s) => s.id).sort(),
          rang: resumeDeLAmbassade(L.get('ADJOA-Q2X')!, L, fiches, reglage, AUJ).rang,
        };
      };
      const seule = monde(r6Base);
      vaut('le banc a de quoi juger (trois amies venues, rang Racine)', { recompenses: ['parr-c-grace', 'parr-c-kofi', 'parr-c-rama'], rang: 'tresse' }, seule);
      vaut('les amies de ses amies ne changent ni ses recompenses ni son rang', seule, monde([...r6Base, ...r6Descendance]));
      return ecarts;
    },
    pannes: [
      PANNE_GLISSANTE,
      { nom: 'le rang compte sur douze mois', mute: [P(MOTEUR, '    rang: rangDe(venues.length).id,\n  };', '    rang: rangDe(venues.filter((f) => (f.venueLe ?? \'\') > `${Number(aujourdhui.slice(0, 4)) - 1}${aujourdhui.slice(4)}`).length).id,\n  };')] },
      PANNE_ECHO,
      { nom: 'le rang compte l arbre', mute: [P(MOTEUR, '    rang: rangDe(venues.length).id,\n  };', '    rang: rangDe(venues.length + echosDe(l, L, parCodeDeFiche).length).id,\n  };')] },
    ],
  },

  /* ══ R7 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R7', nom: 'R7 l ancien code ne donne rien : la regle de l Edge, executee, et sa lettre',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const edge = lf(lit(EDGE));
      const sans = sansCommentaires(edge);
      const bloc = /\/\* ⟨code-actif⟩ \*\/\n([\s\S]*?)\/\* ⟨\/code-actif⟩ \*\//.exec(edge)?.[1] ?? '';
      const forme = /const FORME_DU_CODE = (\/.+\/);/.exec(sans)?.[1];
      vrai('l Edge porte le bloc code-actif et sa forme', bloc.includes('function codeActifDe(') && !!forme);
      if (bloc && forme) {
        const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
        const { code: js } = await transform(`const FORME_DU_CODE = ${forme};\n${bloc}\nexport { codeActifDe };`, { loader: 'ts', format: 'esm' });
        const banc = mkdtempSync(path.join(os.tmpdir(), 'douze-lunes-'));
        let copie: { codeActifDe: (f: unknown) => string | null };
        try {
          const f = path.join(banc, 'code-actif.mjs');
          writeFileSync(f, js);
          copie = await import(pathToFileURL(f).href);
        } finally {
          rmSync(banc, { recursive: true, force: true });
        }
        vaut('la copie de l Edge : ancien code seul, Graine, Graine archivee, Graine mal formee, rien',
          [null, 'ADJOA-Q2X', null, null, null, 'ADJOA-Q2X', null],
          [{ codeParrain: 'ADJOA-K7M' }, { graine: { code: 'ADJOA-Q2X' } }, { graine: { code: 'ADJOA-Q2X' }, archived: true },
            { graine: { code: 'adjoa-q2x' } }, { graine: null, codeParrain: 'ADJOA-K7M' }, { graine: { code: 'ADJOA-Q2X' }, codeParrain: 'ADJOA-K7M' }, null]
            .map((x) => copie.codeActifDe(x)));
      }
      const duCode = fonction(sans, 'async function marraineDuCode', 'async function ');
      vrai('marraineDuCode existe', duCode.length > 100);
      vrai('la marraine ne se cherche plus dans les demandes', !/from\('demandes'\)/.test(duCode));
      vrai('... mais par le code de la Graine', /\.eq\('data->graine->>code', code\)/.test(duCode));
      vrai('... jugee par la copie de codeActifDe, une seule fiche', /codeActifDe\(f\.data\) === code/.test(duCode) && /if \(vivantes\.length !== 1\) return null;/.test(duCode));
      vrai('aucune lecture par l ancien codeParrain dans l Edge', !/'data->>codeParrain'/.test(sans));
      vrai('le site ne cree plus de code : parrainage_ferme, sans base', /if \(body\.parrainage === true\) return json\(\{ error: 'parrainage_ferme' \}, 409\);/.test(sans));
      vrai('... plus de fabrique de codes ni de demande Marraine', !/codePourLaMarraine|profil: 'Marraine'|function codeDeMarraine/.test(sans));
      vrai('« qui » ne connait que marraineDuCode', /await marraineDuCode\(code\)/.test(fonction(sans, 'async function quiOffre', 'async function ')));
      return ecarts;
    },
    pannes: [
      { nom: 'un ancien codeParrain ouvre encore (copie de l Edge)', mute: [P(EDGE, "const code = f.graine && typeof f.graine === 'object' ? f.graine.code : undefined;", "const code = f.graine && typeof f.graine === 'object' ? f.graine.code : (fiche as { codeParrain?: unknown }).codeParrain;")] },
      { nom: 'la marraine cherchee dans les demandes', mute: [P(EDGE, '  if (vivantes.length !== 1) return null;', "  if (vivantes.length !== 1) { const { data: m } = await admin.from('demandes').select('id, data').limit(1); return m?.[0] ? { id: m[0].id, prenom: '', telephone: '' } : null; }")] },
      { nom: 'la marraine par l ancien code', mute: [P(EDGE, ".eq('data->graine->>code', code)", ".eq('data->>codeParrain', code)")] },
      { nom: 'le site recree des codes', mute: [P(EDGE, "if (body.parrainage === true) return json({ error: 'parrainage_ferme' }, 409);", 'if (body.parrainage === true) return await codePourLaMarraine(body);')] },
    ],
  },

  /* ══ R8 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R8', nom: 'R8 les copies : toute fonction Edge qui porte un repere copie son original caractere pour caractere',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      /* LA REGLE GENERALE : un repere « ⟨nom⟩ » dans supabase/functions/**
         nomme un original du depot ; une copie sans original connu est une
         faute (on ne confronte pas ce qu'on ne connait pas). */
      const entre = (src: string, nom: string): string | null => {
        const ouvre = `/* ⟨${nom}⟩ */\n`;
        const i = src.indexOf(ouvre);
        const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
        return i < 0 || k < 0 ? null : src.slice(i + ouvre.length, k);
      };
      const ORIGINAUX: Record<string, { fichier: string; extrait: (src: string) => string | null }> = {
        'code-actif': { fichier: POUR, extrait: (s) => entre(s, 'code-actif') },
        bienvenue: { fichier: 'src/shared/parrainage-pur.ts', extrait: (s) => entre(s, 'bienvenue') },
        /* L'original ne porte pas de reperes : de PAGE_DE_LECTURE a la fin. */
        'lecture-entiere': { fichier: 'src/shared/lecture-entiere.ts', extrait: (s) => { const i = s.indexOf('export const PAGE_DE_LECTURE'); return i < 0 ? null : s.slice(i).trimEnd(); } },
      };
      const fonctions: string[] = [];
      const marche = (d: string) => { for (const n of readdirSync(d)) { const p = `${d}/${n}`; if (statSync(p).isDirectory()) marche(p); else if (/\.(ts|js)$/.test(n)) fonctions.push(p); } };
      marche('supabase/functions');
      const copiesDe = new Map<string, number>();
      for (const f of fonctions) {
        const src = lf(readFileSync(f, 'utf8'));
        for (const m of src.matchAll(/\/\* ⟨([a-z0-9-]+)⟩ \*\//g)) {
          const nom = m[1];
          const original = ORIGINAUX[nom];
          if (!original) { ecarts.push(`${f} : le repere ⟨${nom}⟩ ne nomme aucun original connu du harnais`); continue; }
          const copie = entre(src, nom);
          if (copie === null) { ecarts.push(`${f} : ⟨${nom}⟩ sans son repere de fin`); continue; }
          const ori = original.extrait(lf(readFileSync(original.fichier, 'utf8')));
          if (!ori || ori.length < 100) { ecarts.push(`${original.fichier} : l original de ⟨${nom}⟩ est introuvable`); continue; }
          const copieNette = copie.trimEnd();
          if (copieNette !== ori) {
            let k = 0;
            while (k < Math.min(copieNette.length, ori.length) && copieNette[k] === ori[k]) k += 1;
            ecarts.push(`${f} : ⟨${nom}⟩ differe de ${original.fichier} au caractere ${k} : « ${ori.slice(k, k + 30)} » / « ${copieNette.slice(k, k + 30)} »`);
          }
          copiesDe.set(nom, (copiesDe.get(nom) ?? 0) + 1);
        }
      }
      vrai('chaque original enregistre a au moins une copie (sinon le registre ment)', Object.keys(ORIGINAUX).every((n) => (copiesDe.get(n) ?? 0) > 0));
      const formeEdge = /const FORME_DU_CODE = (\/.+\/);/.exec(sansCommentaires(lit(EDGE)))?.[1];
      vrai('la copie de codeActifDe s appuie sur la meme FORME_DU_CODE', formeEdge === String(FORME_DU_CODE));
      return ecarts;
    },
    pannes: [
      { nom: 'un caractere change dans la copie code-actif de l Edge', mute: [P(EDGE, "return f.archived !== true && typeof code === 'string'", "return f.archived != true && typeof code === 'string'")] },
      { nom: 'un caractere change dans la copie lecture-entiere de l Edge', mute: [P(EDGE, 'const PAGES_AU_PLUS = 2000;', 'const PAGES_AU_PLUS = 2001;')] },
      { nom: 'l original change seul', mute: [P(POUR, "return f.archived !== true && typeof code === 'string'", "return f.archived != true && typeof code === 'string'")] },
      { nom: 'une copie sans original connu', mute: [P(EDGE, '/* ⟨/code-actif⟩ */', '/* ⟨/code-actif⟩ */\n/* ⟨inconnu⟩ */\nconst x = 1;\n/* ⟨/inconnu⟩ */')] },
      { nom: 'la forme du code change dans l Edge', mute: [P(EDGE, 'const FORME_DU_CODE = /^[A-Z]{1,6}-', 'const FORME_DU_CODE = /^[A-Z]{1,7}-')] },
    ],
  },

  /* ══ R9 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R9', nom: 'R9 le crochet : les Graines apres les reglages et le lancement, sous le plafond, un geste par passage',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const brut = lit(CROCHET);
      const src = sansCommentaires(brut);
      const graines = src.indexOf('grainesAAttribuer(');
      vrai('le crochet calcule les Graines', graines > 0);
      vrai('... apres que mnd_parrainage ET mnd_douze_lunes sont descendus', /if \(!documentDescendu\('mnd_parrainage'\) \|\| !documentDescendu\('mnd_douze_lunes'\)\) return;/.test(src)
        && src.indexOf("documentDescendu('mnd_douze_lunes')") < graines);
      /* Le calcul des Graines vit DANS le bloc ouvert par le lancement. */
      const etape = etapesDeLEffet(brut).find((t) => t.includes('grainesAAttribuer(')) ?? '';
      vrai('... seulement apres le lancement (dans le bloc if (lunes.lanceLe))', /^if \(lunes\.lanceLe\) \{/.test(etape));
      vrai('... jamais plus de PLAFOND_SANS_MAIN d un coup', /if \(graines\.length > 0 && graines\.length <= PLAFOND_SANS_MAIN\) \{/.test(etape));
      vrai('aucune exclusion (decision 2) : un ensemble vide', /const exclues = new Set<string>\(\);/.test(etape) && /, exclues\);/.test(etape) && !/estDependant|aUnPrixConvenu/.test(src));
      const classement = [...src.matchAll(/classementStore\)\.set\(([^;]*)\);/g)].map((m) => m[1]);
      vrai('le classement de Ma Couronne est TOUJOURS vide', classement.length === 1 && classement[0] === 'CLASSEMENT_VIDE' && !/classementVisible/.test(src));
      vrai('le jour est celui de la Maison (jourDuSalon)', /const aujourdhui = jourDuSalon\(/.test(src));
      vrai('la carte jointe au merci porte le code de la Graine', /const code = codeActifDe\(fiche\);/.test(src));
      for (const e of unGesteParPassage(brut)) ecarts.push(e);
      return ecarts;
    },
    pannes: [
      { nom: 'les Graines avant le reglage des Lunes', mute: [P(CROCHET, "if (!documentDescendu('mnd_parrainage') || !documentDescendu('mnd_douze_lunes')) return;", "if (!documentDescendu('mnd_parrainage')) return;")] },
      { nom: 'les Graines sans lancement', mute: [P(CROCHET, '    if (lunes.lanceLe) {\n      const exclues', '    if (true) {\n      const exclues')] },
      { nom: 'plus de plafond', mute: [P(CROCHET, 'if (graines.length > 0 && graines.length <= PLAFOND_SANS_MAIN) {', 'if (graines.length > 0) {')] },
      { nom: 'les enfants exclus', mute: [P(CROCHET, 'const exclues = new Set<string>();', 'const exclues = new Set<string>(clients.filter((c) => !!c.familyId).map((c) => c.id));')] },
      { nom: 'le classement rendu aux clientes', mute: [P(CROCHET, "classementStore).set(CLASSEMENT_VIDE);", "classementStore).set(reglage.classementVisible ? CLASSEMENT_VIDE : CLASSEMENT_VIDE);")] },
      { nom: 'une etape ecrit sans rendre la main', mute: [P(CROCHET, 'parrainage: resumes.get(c.id) } : c)));\n      return;', 'parrainage: resumes.get(c.id) } : c)));')] },
    ],
  },

  /* ══ R10 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R10', nom: 'R10 Ma Couronne : la carte derriere la Graine, le meme compte que le Trone, « De main en main », pas de classement',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const carte = sansCommentaires(lit(CARTE));
      const onglets = sansCommentaires(lit(ONGLETS));
      vrai('pas de classement dans Ma Couronne', ![carte, onglets].some((s) => /classement-ambassade|useClassement/.test(s)));
      vrai('... ni de defi', ![carte, onglets].some((s) => /\.defi\b/.test(s)));
      const donnees = fonction(carte, 'export function donneesDeMaCarte', '\n}');
      vrai('la carte prend le code de la regle pure (la Graine ; l ancien code avant le lancement seulement)',
        /^\s*const code = codeDeLaCarte\(client, lance\);\s*if \(!client \|\| !code\) return null;/.test(donnees.slice(donnees.indexOf('{') + 1)));
      vrai('le compte vient du juge du Trone (douze-lunes-pur)', /import \{[^}]*\bvisitesDesLunes\b[^}]*\} from '\.\.\/\.\.\/shared\/douze-lunes-pur';/.test(carte)
        && /visitesDesLunes\(appts, client\.id, todayIso\(\)\)/.test(carte) && !/venuesDeLAnnee/.test(carte));
      vrai('N vient du document du programme', /seuilDeLaGraine\(lunes\)/.test(carte) && /useDouzeLunes\(\)/.test(carte));
      vrai('le titre est « De main en main », dans la carte et l accueil', /t\('De main en main'\)/.test(carte) && /t\('De main en main/.test(onglets));
      vrai('... jamais « Les Douze Lunes » a l ecran', ![carte, onglets].some((s) => /['"`][^'"`\n]*Douze Lunes/.test(s)));
      vrai('... et il a son anglais', readdirSync('src/apps/couronne/i18n').some((f) => /'De main en main': '[^']+'/.test(lit(`src/apps/couronne/i18n/${f}`))));
      vrai('la pastille du rang ne parait qu avec la carte', /\{maCarte && \(\s*<span className="mc-pillseal">/.test(onglets));
      vrai('le recto dit toujours CARTE DE MARRAINE et le rang, Graine comprise (decision 7)', /CARTE DE MARRAINE · \$\{nomDuRang\(d\.rang \?\? 'graine'\)/.test(sansCommentaires(lit('src/ds/carte-marraine.ts'))));
      /* N et le lancement se lisent par les clientes connectees : la
         derniere migration qui nomme la cle doit l'ouvrir, et a elles seules. */
      const nommees = migrations().filter((m) => m.sql.includes("'mnd_douze_lunes'"));
      const derniere = nommees[nommees.length - 1];
      vrai(`la derniere migration qui nomme mnd_douze_lunes l ouvre aux connectees seulement (${derniere?.nom ?? 'aucune'})`,
        !!derniere && /create policy \w+ on public\.documents for select to authenticated\s+using \(key = 'mnd_douze_lunes'\);/.test(derniere.sql)
        && !/to (?:anon|public)\s+using \(key = 'mnd_douze_lunes'\)/.test(derniere.sql));
      return ecarts;
    },
    pannes: [
      { nom: 'le classement revient dans Ma Couronne', mute: [P(CARTE, "import { useDouzeLunes } from '../../shared/douze-lunes';", "import { useDouzeLunes } from '../../shared/douze-lunes';\nimport { useClassement } from '../../shared/classement-ambassade';")] },
      { nom: 'la carte pour toutes', mute: [P(CARTE, '  const code = codeDeLaCarte(client, lance);', '  const code = client?.codeParrain;')] },
      { nom: 'un compte a part', mute: [P(CARTE, 'visitesDesLunes(appts, client.id, todayIso())', 'venuesDeLAnnee(appts, client.id)')] },
      { nom: 'l ancien titre', mute: [P(CARTE, "t('De main en main')", "t('Les Douze Lunes')")] },
      { nom: 'N ouvert au site public', mute: [P(M0124, "create policy docs_douze_lunes_read on public.documents for select to authenticated", 'create policy docs_douze_lunes_read on public.documents for select to anon')] },
    ],
  },

  /* ══ R11 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R11', nom: 'R11 la base : sept champs gardes, la garde du personnel, un banc dans les deux sens, tout repli sous RLS',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const toutes = migrations();
      /* La DEFINITION, pas le declencheur qui l'appelle (`execute function`). */
      const definissent = toutes.filter((m) => /create (?:or replace )?function public\.clients_protege_parrainage\(\)/.test(m.sql));
      const d = definissent[definissent.length - 1];
      vrai(`la derniere definition du declencheur est lue (${d?.nom ?? 'aucune'})`, !!d);
      const sql = d?.sql ?? '';
      const SEPT = ['codeParrain', 'parrainage', 'soinsOfferts', 'parraineePar', 'parraineeLe', 'graine', 'avantLesDouzeLunes'];
      vrai('les sept champs sont reimposes a la cliente', SEPT.every((k) => sql.includes(`'${k}', old.data -> '${k}'`)));
      vrai('... et retires d une fiche qu elle cree', SEPT.every((k) => new RegExp(`- '${k}'`).test(sql)));
      vrai('son choix et sa couleur de carte restent a elle', !/'choixRecompenses'|'carteModele'/.test(sql));
      vrai('l editeur SQL et les fonctions Edge gardent la main', /if auth\.uid\(\) is null then return new; end if;/.test(sql));
      vrai('le personnel passe par la garde une fois lance', /public\.douze_lunes_garde\(old\.data, new\.data, lance\)/.test(sql) && !/if public\.is_staff\(\) then return new;/.test(sql));
      vrai('le declencheur garde l insertion comme la mise a jour', /before insert or update on public\.clients/.test(sql));
      const garde = toutes.filter((m) => /function public\.douze_lunes_garde\(/.test(m.sql)).pop()?.sql ?? '';
      vrai('la garde reconnait echo, rang et defi par la source ET par l identifiant', /in \('echo', 'defi', 'rang'\)/.test(garde) && /'\^\(echo\|defi\|rang\)-'/.test(garde));
      const banc = garde.slice(garde.indexOf('do $bloc$'));
      vrai('le banc SQL eprouve les deux sens', (banc.match(/\('passe'/g) ?? []).length >= 1 && (banc.match(/\('refuse'/g) ?? []).length >= 1 && /raise exception/.test(banc));
      /* TOUT REPLI SOUS RLS, dans toutes les migrations, dans le meme fichier. */
      for (const m of toutes) {
        for (const c of m.sql.matchAll(/create table (?:if not exists )?(?:public\.)?(repli_[a-z0-9_]+)/gi)) {
          const t = c[1];
          const rls = new RegExp(`alter table (?:public\\.)?${t} enable row level security`, 'i');
          if (!rls.test(m.sql.slice(c.index ?? 0))) ecarts.push(`${m.nom} : ${t} cree sans enable row level security`);
        }
      }
      const docs = toutes.filter((m) => /docs_ambassade_read/.test(m.sql)).pop()?.sql ?? '';
      vrai('le classement ne se lit plus par les clientes (decision 6)', /drop policy if exists docs_ambassade_read on public\.documents;/.test(docs) && !/create policy docs_ambassade_read/.test(docs));
      return ecarts;
    },
    pannes: [
      { nom: 'la regle d hier relue (la definition de 0124 ne se reconnait plus)', mute: [P(M0124, 'create or replace function public.clients_protege_parrainage()', 'create or replace function public.clients_protege_parrainage_x()')] },
      { nom: "'graine' retire des champs gardes", mute: [P(M0124, "                         'graine', old.data -> 'graine',\n", '')] },
      { nom: 'la RLS du repli 0124 enlevee', mute: [P(M0124, 'alter table public.repli_0124_clients enable row level security;', '')] },
      { nom: 'la RLS d un ancien repli enlevee (la regle est generale)', mute: [P('supabase/migrations/0118_le_carnet_retrouve.sql', 'alter table public.repli_0118_appointments enable row level security;', '')] },
      { nom: 'le personnel sans garde', mute: [P(M0124, '  if public.is_staff() then\n    lance :=', '  if public.is_staff() then return new; end if;\n  if public.is_staff() then\n    lance :=')] },
      { nom: 'le banc n eprouve qu un sens', mute: [P(M0124, "('refuse',", "('passe',")] },
      { nom: 'le choix de la cliente protege', mute: [P(M0124, "                         'graine', old.data -> 'graine',\n", "                         'graine', old.data -> 'graine',\n                         'choixRecompenses', old.data -> 'choixRecompenses',\n")] },
    ],
  },

  /* ══ R12 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R12', nom: 'R12 le site : le code d une Graine voyage jusqu au serveur, plus aucun code distribue, ni cadeau promis ni N',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const reserver = sansCommentaires(lit('src/apps/revelateur/ilots/Reserver.tsx'));
      vrai('un code de forme marraine part au serveur (dans codeAmie)', /: FORME_DU_CODE\.test\(codeNormalise\(code\)\) \? \{ codeAmie: codeNormalise\(code\) \} : \{\}\)/.test(reserver));
      const choisit = fonction(reserver, 'const choisit = ', '\n  };');
      vrai('le choix du parcours garde le code dans l adresse', /replaceState\([^;]*&code=/.test(choisit) && /codeDeLAdresse\(\)/.test(choisit));
      vrai('un code inconnu du serveur le dit sans promettre', reserver.includes('Ce code n’ouvre pas de cadeau de bienvenue. Vous pouvez réserver au prix de la carte.'));
      const parrainer = sansCommentaires(lit('src/apps/revelateur/ilots/Parrainer.tsx'));
      vrai('le site ne demande plus de code', !/parrainage: true|fetch\(|demande-submit/.test(parrainer));
      const page = (chemin: string) => lit(`revelateur${chemin}index.html`);
      const m = page('/m/');
      vrai('la page /m/ est generee (genere-revelateur d abord)', m.length > 0);
      const visibles = (h: string) => [/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? '', /<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? '', /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)?.[1] ?? ''];
      vrai('/m/ ne promet pas de cadeau (titre, description, h1)', m.length > 0 && !visibles(m).some((t) => /cadeau/i.test(t)));
      vrai('/m/ reste hors des moteurs', /<meta name="robots" content="noindex" \/>/.test(m));
      const parrainage = page('/parrainage/');
      vrai('la page /parrainage/ garde son adresse et monte l ilot', parrainage.includes('data-ilot="parrainer"'));
      const texte = (h: string) => {
        const main = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
        return main.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      };
      const accueil = page('/');
      const section = accueil.slice(accueil.indexOf('id="parrainage"'), accueil.indexOf('</section>', accueil.indexOf('id="parrainage"')));
      for (const [ou, t] of [['/parrainage/', texte(parrainage)], ['l accueil', texte(`<main>${section}</main>`)], ['/m/', texte(m)]] as const) {
        vrai(`${ou} ne dit pas N (au fil de vos visites)`, !/\b\d+\s*(?:visites?\b|ᵉ\s*visite|e\s+visite)/i.test(t));
        vrai(`${ou} ne dit ni salon ni tiret cadratin`, !/\bsalon\b|—/i.test(t));
      }
      vrai('/parrainage/ dit « au fil de vos visites »', /au fil de vos visites/i.test(texte(parrainage)));
      return ecarts;
    },
    pannes: [
      { nom: 'le code de marraine ne voyage plus (offreDuMoment seul)', mute: [P('src/apps/revelateur/ilots/Reserver.tsx', ': FORME_DU_CODE.test(codeNormalise(code)) ? { codeAmie: codeNormalise(code) } : {}),', ': {}),')] },
      { nom: 'le code se perd a la porte', mute: [P('src/apps/revelateur/ilots/Reserver.tsx', "${codePose ? `&code=${encodeURIComponent(codePose)}` : ''}", '')] },
      { nom: '/m/ promet un cadeau', mute: [P('revelateur/m/index.html', '<h1>La Maison vous attend.</h1>', '<h1>Votre cadeau vous attend.</h1>')] },
      { nom: 'le site redemande un code', mute: [P('src/apps/revelateur/ilots/Parrainer.tsx', 'export default function Parrainer() {', "export default function Parrainer() {\n  void fetch('/x', { method: 'POST', body: JSON.stringify({ parrainage: true }) });")] },
      { nom: 'le site dit N', mute: [P('revelateur/parrainage/index.html', 'Au fil de vos visites, la Maison vous remet', 'À votre 5ᵉ visite, la Maison vous remet')] },
    ],
  },
  /* ══ R13 ═════════════════════════════════════════════════════════════
     RELECTURE DE SURETE (9 octobre 2026, au soir). Une fiche d'avant le
     geste, renvoyee par un poste qui n'a pas vu passer le lancement, rendait
     a la cliente les mercis que le geste avait ranges : la garde (c) ne
     retirait que l'echo, le rang et le defi. Et l'ancien moteur d'un vieux
     poste pouvait encore poser un merci sur une fiche sans Graine, et
     envoyer son remerciement : le geste eteint desormais l'ancien
     remerciement, le moteur neuf ne lit que celui du programme. */
  {
    id: 'R13', nom: 'R13 un vieux poste ne ramene rien : ni merci range, ni merci sans Graine, ni remerciement de l ancien moteur',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const toutes = migrations();
      const garde = toutes.filter((m) => /function public\.douze_lunes_garde\(/.test(m.sql)).pop()?.sql ?? '';
      const corps = garde.slice(garde.indexOf('function public.douze_lunes_garde('), garde.indexOf('do $bloc$'));
      const c = corps.slice(corps.indexOf("jsonb_typeof(sortie -> 'soinsOfferts') = 'array'"));
      vrai('(c) retire une recompense que l archive de la ligne range', /jsonb_array_elements\(case when jsonb_typeof\(ancien -> 'avantLesDouzeLunes' -> 'soinsRetires'\) = 'array'\s+then ancien -> 'avantLesDouzeLunes' -> 'soinsRetires' else '\[\]'::jsonb end\) as r\(e\)\s+where \(r\.e ->> 'id'\) = \(s\.e ->> 'id'\)\)/.test(c));
      vrai('(c) retire un merci neuf sur une fiche sans Graine', /\(coalesce\(s\.e ->> 'source', ''\) = 'amie' or coalesce\(s\.e ->> 'id', ''\) ~ '\^parr-'\)\s+and jsonb_typeof\(sortie -> 'graine'\) is distinct from 'object'/.test(c));
      vrai('(c) garde ce que la ligne portait deja (la caisse le consomme)', /where exists \(\s*select 1\s+from jsonb_array_elements\(case when jsonb_typeof\(ancien -> 'soinsOfferts'\) = 'array'/.test(c));
      /* Le banc SQL tourne a la migration (raise exception) : il doit PROMETTRE les deux sens de ces regles. */
      const banc = garde.slice(garde.indexOf('do $bloc$'));
      const cas = (sens: string, nom: string) => banc.includes(`('${sens}', '${nom}'`);
      vrai('le banc promet : un merci range qui revient est refuse', cas('refuse', "un merci rangé dans l''archive par le geste ne revient pas avec une fiche périmée"));
      vrai('le banc promet : un merci neuf sur une fiche sans Graine est refuse', cas('refuse', "un merci neuf sur une fiche sans Graine est retiré (l''ancien moteur d''un vieux poste)"));
      vrai('le banc promet : sur une Graine, un merci neuf passe', cas('passe', "sur une Graine dont l''archive range un merci, un merci NEUF passe"));
      vrai('le banc promet : un merci deja la reste', cas('passe', 'un merci déjà sur une fiche sans Graine reste, la caisse le consomme'));
      vrai('le controle compte les recompenses a la fois sur la fiche et dans l archive', /'récompenses à la fois sur la fiche et dans son archive'/.test(lf(lit(M0124))));
      /* Le remerciement : eteint dans mnd_parrainage par le geste, repris dans mnd_douze_lunes. */
      const avant = { merciParWhatsApp: true, bonusRangs: { tresse: 'svc-signature' }, defi: { actif: true, objectif: 2 }, classementVisible: true, cadeauFilleule: 'un soin' };
      const eteint = reglageEteint(avant, LANCE_INSTANT);
      vaut('le geste eteint l ancien programme dans le document, le remerciement compris',
        { merciParWhatsApp: false, bonusRangs: {}, defiActif: false, classementVisible: false, cadeauFilleule: 'un soin' },
        { merciParWhatsApp: eteint.merciParWhatsApp, bonusRangs: eteint.bonusRangs, defiActif: (eteint.defi as { actif?: boolean }).actif, classementVisible: eteint.classementVisible, cadeauFilleule: eteint.cadeauFilleule });
      vaut('... le programme neuf reprend le remerciement d avant, meme a la reprise du geste', [true, true],
        [merciDuLancement(eteint), merciDuLancement(reglageEteint(eteint, '2026-10-10T08:00:00.000Z'))]);
      vrai('... et le retour rend le document tel quel', memeContenu(reglageRendu(reglageEteint(avant, LANCE_INSTANT)), avant));
      vrai('... meme un document qui n avait ni bonus, ni classement, ni remerciement', memeContenu(reglageRendu(reglageEteint({ cadeauFilleule: 'un soin' }, LANCE_INSTANT)), { cadeauFilleule: 'un soin' }));
      vaut('le moteur ne lit que le remerciement du programme', [false, true],
        [reglageDuMoteur({ merciParWhatsApp: true }, { merciParWhatsApp: false }, LANCE).merciParWhatsApp, reglageDuMoteur({}, { merciParWhatsApp: true }, LANCE).merciParWhatsApp]);
      vrai('le crochet passe par reglageDuMoteur', /const reglageAmb: ReglageAmbassade = reglageDuMoteur\(reglage, lunes, lanceLe\);/.test(sansCommentaires(lit(CROCHET))));
      const geste = sansCommentaires(lit(GESTE));
      vrai('le geste eteint le reglage par reglageEteint et reprend le remerciement', /const eteint = reglageEteint\(r, le\);/.test(geste) && /merciParWhatsApp: merci, lanceLe: le/.test(geste));
      return ecarts;
    },
    pannes: [
      { nom: 'la garde oublie l archive', mute: [P(M0124, "          or exists (\n            select 1\n            from jsonb_array_elements(case when jsonb_typeof(ancien -> 'avantLesDouzeLunes' -> 'soinsRetires') = 'array'\n                                           then ancien -> 'avantLesDouzeLunes' -> 'soinsRetires' else '[]'::jsonb end) as r(e)\n            where (r.e ->> 'id') = (s.e ->> 'id'))\n", '')] },
      { nom: 'la garde laisse un merci sur une fiche sans Graine', mute: [P(M0124, "\n          or ((coalesce(s.e ->> 'source', '') = 'amie' or coalesce(s.e ->> 'id', '') ~ '^parr-')\n              and jsonb_typeof(sortie -> 'graine') is distinct from 'object'))", ')')] },
      { nom: 'le banc ne promet plus le merci range', mute: [P(M0124, "      ('refuse', 'un merci rangé dans l''archive par le geste ne revient pas avec une fiche périmée',", "      ('refuse', 'un merci rangé autrement',")] },
      { nom: 'le geste laisse l ancien remerciement allume', mute: [P(POUR, '    merciParWhatsApp: false,\n  } as unknown as R;', '  } as unknown as R;')] },
      { nom: 'le moteur relit l ancien remerciement', mute: [P(MOTEUR, 'merciParWhatsApp: lunes?.merciParWhatsApp === true,', 'merciParWhatsApp: reglage.merciParWhatsApp === true || lunes?.merciParWhatsApp === true,')] },
      { nom: 'le retour garde l ancien reglage', mute: [P(POUR, "  for (const k of ['avantLesDouzeLunes', 'bonusRangs', 'defi', 'classementVisible', 'merciParWhatsApp']) delete rendu[k];", "  for (const k of ['avantLesDouzeLunes']) delete rendu[k];")] },
    ],
  },

  /* ══ R14 ═════════════════════════════════════════════════════════════
     Poser des Graines (le bandeau de l'accord, un N baisse, le lancement)
     liberait d'un coup les mercis des amies deja venues, chacun avec son
     remerciement WhatsApp, quand l'ecran disait « aucun message ne part ».
     La borne : le message ne part que pour une amie venue depuis la Graine
     de sa marraine ; et l'ecran compte avant de dire. */
  {
    id: 'R14', nom: 'R14 les mercis en retard se posent en silence, et l ecran compte avant de promettre',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const reglage: ReglageAmbassade = { merciParWhatsApp: true, lanceLe: LANCE };
      /* Une marraine devenue Graine le 10 novembre ; une amie venue avant (le 20 octobre), une apres (le 12 novembre). */
      const fiches = [
        fiche({ id: 'm', name: 'Mena A', graine: { code: 'MENA-Q2X', le: '2026-11-10', atteinteLe: '2026-11-10', seuil: 5 }, codeParrain: 'MENA-Q2X', avantLesDouzeLunes: { le: LANCE_INSTANT, codeParrain: 'MENA-K7M', soinsRetires: [] } }),
        fiche({ id: 'tot', name: 'Tina B', parraineePar: 'MENA-K7M' }),
        fiche({ id: 'tard', name: 'Tara C', parraineePar: 'MENA-Q2X' }),
      ];
      const rdvs = [rdv('tot', '2026-10-20'), rdv('tard', '2026-11-12')];
      const poses = recompensesAPoser(fiches, lignees(fiches, [], rdvs), reglage, '2026-11-12');
      vaut('les deux mercis se posent (decision 5)', ['parr-c-tard', 'parr-c-tot'], (poses.parFiche.get('m') ?? []).map((s) => s.id).sort());
      vaut('... le remerciement ne part que pour l amie venue depuis la Graine', ['Tara'], poses.mercis.map((m) => m.prenomFilleule));
      vaut('... et seul son merci porte merciLe', { 'parr-c-tard': true, 'parr-c-tot': false },
        Object.fromEntries((poses.parFiche.get('m') ?? []).map((s) => [s.id, !!s.merciLe])));
      /* Le cas de la relecture : quinze anciennes marraines atteignent leur Nieme visite ensemble. */
      const quinze: FicheAmb[] = [];
      const leurs: RdvLu[] = [];
      for (let i = 0; i < 15; i++) {
        const code = `MAR${String.fromCharCode(65 + i)}-K7M`;
        quinze.push(fiche({ id: `q${String(i).padStart(2, '0')}`, name: `Marraine${i} X`, avantLesDouzeLunes: { le: LANCE_INSTANT, codeParrain: code, soinsRetires: [] } }));
        quinze.push(fiche({ id: `qa${String(i).padStart(2, '0')}`, name: `Amie${i} Y`, parraineePar: code }));
        leurs.push(...venues(`q${String(i).padStart(2, '0')}`, ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-11-10']), rdv(`qa${String(i).padStart(2, '0')}`, '2026-10-20'));
      }
      const graines = grainesAAttribuer(quinze, leurs, 5, '2026-11-12', codesConnus(quinze, []));
      vrai('le banc a ses quinze Graines, au-dela du plafond', graines.length === 15 && graines.length > PLAFOND_SANS_MAIN);
      const parFiche = new Map(graines.map((g) => [g.clientId, g.graine]));
      const apres = quinze.map((c) => (parFiche.has(c.id) ? { ...c, graine: parFiche.get(c.id)!, codeParrain: parFiche.get(c.id)!.code } : c));
      const lot = recompensesAPoser(apres, lignees(apres, [], leurs), reglage, '2026-11-12');
      vaut('poser les quinze : quinze mercis, AUCUN remerciement d un coup', { mercis: 15, messages: 0 },
        { mercis: [...lot.parFiche.values()].flat().length, messages: lot.mercis.length });
      /* L'ecran : le compte du moteur, sur les fiches d'apres. */
      const lunes: ReglageDesLunes = { seuilGraine: 5, lanceLe: LANCE_INSTANT, merciParWhatsApp: true };
      const accord = mercisDesGraines(quinze as never, graines, leurs, [], {}, lunes, '2026-11-12');
      vaut('l accord des Graines compte ce qu il libere', { mercis: 15, messages: 0 }, accord);
      /* Une amie venue le jour meme de la Graine : son remerciement part, et l'ecran le dit. */
      const avecLeJour = [...quinze, fiche({ id: 'qz', name: 'Zoe Z', parraineePar: graines[0].graine.code })];
      vaut('... une amie venue le jour de la Graine : un message, compte', { mercis: 16, messages: 1 },
        mercisDesGraines(avecLeJour as never, graines, [...leurs, rdv('qz', '2026-11-12')], [], {}, lunes, '2026-11-12'));
      const auLancement = [...r4Fiches, fiche({ id: 'afi', name: 'Afi Z', parraineePar: 'ADJOA-K7M' })];
      const rdvsDuJour = [...r4Rdvs, rdv('afi', LANCE)];
      const plan = planDuLancement(auLancement, rdvsDuJour, [], { seuilGraine: 5 }, LANCE);
      vaut('le lancement compte l amie venue le jour meme (Afi, chez Adjoa)', { mercis: 1, messages: 1 },
        mercisDuLancement(auLancement as never, plan, rdvsDuJour, [], { merciParWhatsApp: true }, LANCE));
      vaut('... et rien sans remerciement allume', { mercis: 1, messages: 0 },
        mercisDuLancement(auLancement as never, plan, rdvsDuJour, [], {}, LANCE));
      /* Les mots : « aucun message » ne se dit que sur le compte. */
      const fenetre = sansCommentaires(lit(FENETRE));
      vaut('« Aucun message ne part » ne s ecrit qu une fois, dans ceQuiSuit', 1, (fenetre.match(/Aucun message ne part/g) ?? []).length);
      vrai('... et seulement quand le compte vaut zero', /if \(m\.mercis === 0\) return 'Aucun message ne part\.';/.test(fenetre));
      vrai('l accord et le lancement comptent avant de dire', /mercisDesGraines\(clients, graines,/.test(fenetre) && /mercisDuLancement\(clients, plan,/.test(fenetre) && /ceQuiSuit\(suite, 'Le geste'\)/.test(fenetre));
      vrai('le bandeau des Graines ne promet plus le silence', !/aucun message ne part/i.test(sansCommentaires(lit(PARRAINAGES))));
      return ecarts;
    },
    pannes: [
      { nom: 'le remerciement part aussi pour les mercis en retard', mute: [P(MOTEUR, "const merci = !!reglage.merciParWhatsApp && f.venueLe.slice(0, 10) >= (c.graine?.le ?? '9999-12-31');", 'const merci = !!reglage.merciParWhatsApp;')] },
      { nom: 'l accord promet le silence sans compter', mute: [P(FENETRE, "suite: `${ceQuiSuit(suite, 'Le geste')} Une Graine posée", "suite: `Aucun message ne part. Une Graine posée")] },
      { nom: 'le bandeau promet le silence', mute: [P(PARRAINAGES, 'Relisez la liste ; la ligne dit les mercis qu’elles libèrent.', 'Relisez la liste ; aucun message ne part.')] },
      { nom: 'le compte de l ecran oublie les messages', mute: [P(GESTE, 'const messages = poses.mercis.filter(', 'const messages = 0 * poses.mercis.filter(')] },
    ],
  },

  /* ══ R15 ═════════════════════════════════════════════════════════════
     Revenir a avant puis relancer perdait ce que la fenetre avait donne :
     le merci repartait dans l'archive (qui vaut « deja pose »), le code
     d'une Graine deja utilise par une amie etait interdit au second tirage.
     Le retour n'est donc permis que tant que rien n'a ete donne. */
  {
    id: 'R15', nom: 'R15 le retour en arriere n efface jamais ce que le programme a donne',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const x0 = fiche({ id: 'x', name: 'Xavia K', codeParrain: 'XAVIA-K7M' });
      const f0 = fiche({ id: 'f', name: 'Fifi B' });
      const rdvsX = venues('x', ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
      const plan1 = planDuLancement([x0, f0], rdvsX, [], { seuilGraine: 5 }, LANCE);
      const lancees = [x0, f0].map((c) => ficheLancee(c, plan1.lignes.find((l) => l.clientId === c.id), LANCE_INSTANT));
      const G = lancees[0].graine?.code ?? '';
      vrai('le banc a sa Graine', FORME_DU_CODE.test(G));
      vaut('une fenetre qui n a rien donne : le retour est permis', [true, [], []],
        [retourPossible(perteDuRetour(lancees, [])), perteDuRetour(lancees, []).mercis, perteDuRetour(lancees, []).codes]);
      /* ... et sans perte, retour puis relance rendent la MEME Graine : rien ne se perd. */
      const rendues = lancees.map((c) => ficheRendue(c));
      const plan2 = planDuLancement(rendues, rdvsX, [], { seuilGraine: 5 }, '2026-10-14');
      vaut('... retour puis relance : la meme Graine, le meme code', G, plan2.lignes.find((l) => l.clientId === 'x')?.graine?.code);
      /* Fifi rattachee par le code de la Graine : le retour est refuse. */
      const rattachee = [lancees[0], { ...lancees[1], parraineePar: G, parraineeLe: '2026-10-10' }];
      vaut('un code de Graine deja utilise par une amie : refuse, et dit', [false, [{ code: G, par: ['Fifi B'] }]],
        [retourPossible(perteDuRetour(rattachee, [])), perteDuRetour(rattachee, []).codes.map((c) => ({ code: c.code, par: c.par }))]);
      vaut('... par une reservation du site aussi', false, retourPossible(perteDuRetour(lancees, [{ id: 'd1', prenom: 'Nadia', parrainDe: G }])));
      /* Un merci pose depuis le lancement : refuse ; un merci range dans l'archive ne compte pas. */
      const merci = soin('parr-c-f', { source: 'amie', poseLe: '2026-10-12' });
      const avecMerci = [{ ...rattachee[0], soinsOfferts: [...(rattachee[0].soinsOfferts ?? []), merci] }, rattachee[1]];
      vaut('un merci pose depuis le lancement : refuse, et nomme', ['parr-c-f'], perteDuRetour(avecMerci, []).mercis.map((m) => m.soinId));
      const rangeSeul = [{ ...lancees[0], avantLesDouzeLunes: { ...lancees[0].avantLesDouzeLunes!, soinsRetires: [merci] }, soinsOfferts: [merci] }];
      vaut('... mais un merci que l archive range deja ne compte pas', [], perteDuRetour(rangeSeul, []).mercis);
      vaut('une fiche pas encore lancee ne compte pas (ses mercis sont d avant)', [], perteDuRetour([{ ...x0, soinsOfferts: [merci] }], []).mercis);
      /* Le geste et l'ecran : la verification passe AVANT tout ecrit. */
      const geste = sansCommentaires(lit(GESTE));
      const annule = fonction(geste, 'export async function annuleLeLancement', '\n}');
      vrai('annuleLeLancement juge la perte avant de toucher au document', /const perte = perteDesMagasins\(\);\s*if \(!retourPossible\(perte\)\) \{/.test(annule)
        && annule.indexOf('retourPossible(perte)') < annule.indexOf('retireLeLancement()'));
      vrai('l ecran ne propose le retour que s il est permis', /\{direction && retourPossible\(perte\)\s*\?/.test(sansCommentaires(lit(FENETRE))));
      return ecarts;
    },
    pannes: [
      { nom: 'le code utilise par une amie ne compte pas', mute: [P(POUR, '...vivantes.filter((x) => x.id !== f.id && x.parraineePar === code)', '...vivantes.filter((x) => x.id !== f.id && false)')] },
      { nom: 'les mercis poses ne comptent pas', mute: [P(POUR, "if (s && classeDeLaRecompense(s) === 'retiree' && !ranges.has(s.id)) perte.mercis.push(", 'if (s && false) perte.mercis.push(')] },
      { nom: 'les reservations du site ne comptent pas', mute: [P(POUR, '...demandes.filter((d) => d && (d.parrainDe === code || d.code === code))', '...demandes.filter((d) => d && false)')] },
      { nom: 'le geste ne verifie plus', mute: [P(GESTE, '  if (!retourPossible(perte)) {\n', '  if (false) {\n')] },
    ],
  },

  /* ══ R16 ═════════════════════════════════════════════════════════════
     Une amie qui n'a pas encore de locks choisit une consultation : le code
     de sa marraine se perdait a la porte (liens /rappel/ sans code, demande
     de rappel sans code, Edge qui ne lisait le code qu'avec une place). Le
     cas le plus courant d'une filleule. */
  {
    id: 'R16', nom: 'R16 le code d une Graine suit l amie jusqu a la demande de rappel, et la lignee la voit',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const reserver = sansCommentaires(lit(RESERVER));
      vaut('les deux portes de la consultation emportent le code', 2, (reserver.match(/href=\{`\$\{base\}\/rappel\/\?besoin=(?:creation|reparation)\$\{suiteDuCode\}`\}/g) ?? []).length);
      vrai('... lu dans l adresse', /const suiteDuCode = \(\(\) => \{ const c = codeDeLAdresse\(\); return c \? `&code=\$\{encodeURIComponent\(c\)\}` : ''; \}\)\(\);/.test(reserver));
      const rappel = sansCommentaires(lit(RAPPEL));
      vrai('la demande de rappel envoie le code d une amie', /\.\.\.\(codeAmie \? \{ codeAmie \} : \{\}\),/.test(rappel) && /useState\(codeDAmieDeLAdresse\)/.test(rappel) && /FORME_DU_CODE\.test\(c\) \? c : ''/.test(rappel));
      const edge = sansCommentaires(lf(lit(EDGE)));
      vrai('l Edge resout le code d une demande sans place, sans remise', /\} else if \(FORME_DU_CODE\.test\(codeNormalise\(codeEcrit\)\)\) \{\s*const code = codeNormalise\(codeEcrit\);\s*duCode = \(await verdictDuParrainage\(code, telephone\)\.catch\(\(\) => null\)\) \?\? \{ code, raison: 'inconnu' \};/.test(edge));
      vrai('... et la marraine n est prevenue que d une place posee (aucun envoi neuf)', /if \(apptId && duCode\.raison === 'parrainage' && duCode\.marraineTelephone\) \{/.test(edge));
      /* Le Trone : la demande de rappel rejoint sa fiche a la conversion. */
      const ficheA = [
        fiche({ id: 'awa', name: 'Awa H', graine: graineDe('AWA-7KQ'), codeParrain: 'AWA-7KQ' }),
        fiche({ id: 'fatou', name: 'Fatou D' }),
      ];
      const sansFiche: DemandeLue = { id: 'd-fatou', prenom: 'Fatou', telephone: '+2290190000000', createdAt: '2026-10-10T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'AWA-7KQ' };
      const convertie: DemandeLue = { ...sansFiche, clientId: 'fatou' };
      const venue = [rdv('fatou', '2026-10-20')];
      vaut('avant la conversion : une amie dans la lignee, pas encore venue', [['d:d-fatou'], 0],
        [(lignees(ficheA, [sansFiche], venue).get('AWA-7KQ')?.filleules ?? []).map((f) => f.cle), recompensesAPoser(ficheA, lignees(ficheA, [sansFiche], venue), { lanceLe: LANCE }, AUJ).parFiche.size]);
      const L = lignees(ficheA, [convertie], venue);
      vaut('convertie : sa fiche, sa venue, le merci de sa marraine', [['c:fatou'], ['parr-d-fatou']],
        [(L.get('AWA-7KQ')?.filleules ?? []).map((f) => f.cle), (recompensesAPoser(ficheA, L, { lanceLe: LANCE }, AUJ).parFiche.get('awa') ?? []).map((s) => s.id)]);
      vaut('... et le code de sa marraine se pose sur sa fiche', [{ clientId: 'fatou', code: 'AWA-7KQ' }],
        rattachementsDuSite(ficheA, [convertie], venue).map((r) => ({ clientId: r.clientId, code: r.code })));
      vaut('... un ancien code d une fiche sans Graine ne rattache toujours personne', [],
        rattachementsDuSite(ficheA, [{ ...convertie, parrainDe: 'YAO-7HP' }], venue));
      return ecarts;
    },
    pannes: [
      { nom: 'le code se perd a la porte de la creation', mute: [P(RESERVER, '/rappel/?besoin=creation${suiteDuCode}', '/rappel/?besoin=creation')] },
      { nom: 'la demande de rappel n envoie pas le code', mute: [P(RAPPEL, '            ...(codeAmie ? { codeAmie } : {}),\n', '')] },
      { nom: 'l Edge ignore le code sans place', mute: [P(EDGE, '} else if (FORME_DU_CODE.test(codeNormalise(codeEcrit))) {', '} else if (false) {')] },
      { nom: 'la lignee ignore la fiche de la conversion', mute: [P(MOTEUR, ': !d.apptId && d.clientId && parId.has(d.clientId) ? d.clientId : undefined;', ': undefined;')] },
      { nom: 'le rattachement exige un rendez-vous', mute: [P(MOTEUR, "if (d?.codeRaison !== 'parrainage' || !d.parrainDe || (!d.apptId && !d.clientId)) continue;", "if (d?.codeRaison !== 'parrainage' || !d.parrainDe || !d.apptId) continue;")] },
    ],
  },

  /* ══ R17 ═════════════════════════════════════════════════════════════
     L'ordre de mise en ligne ne tient plus par la seule procedure :
     build-sites refait les six sites, et une autre session peut publier un
     autre soir. Le site envoie le code d'une amie dans un champ que
     l'ANCIENNE fonction ignore ; Ma Couronne garde l'ancienne carte tant
     que le programme n'est pas lance. */
  {
    id: 'R17', nom: 'R17 publie trop tot, le site n ouvre aucun ancien code et Ma Couronne n efface aucune carte',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const reserver = sansCommentaires(lit(RESERVER));
      vrai('le site n envoie dans code que le code d une offre du moment', /\.\.\.\(offreDuMoment \? \{ code: codeNormalise\(code\) \}\s*: FORME_DU_CODE\.test\(codeNormalise\(code\)\) \? \{ codeAmie: codeNormalise\(code\) \} : \{\}\),/.test(reserver));
      const edge = sansCommentaires(lf(lit(EDGE)));
      vrai('l Edge neuve lit les deux champs, et les resout pareil', /const codeEcrit = d\.codeAmie \?\? d\.code;/.test(edge) && /remiseDuCode\(\{ code: codeEcrit,/.test(edge) && !/remiseDuCode\(\{ code: d\.code,/.test(edge));
      vaut('la carte de Ma Couronne : la Graine toujours ; l ancien code avant le lancement seulement',
        ['ADJOA-Q2X', 'ADJOA-K7M', null, null, null, null],
        [codeDeLaCarte({ graine: graineDe('ADJOA-Q2X'), codeParrain: 'ADJOA-K7M' }, true),
          codeDeLaCarte({ codeParrain: 'ADJOA-K7M' }, false), codeDeLaCarte({ codeParrain: 'ADJOA-K7M' }, true),
          codeDeLaCarte({ codeParrain: 'ADJOA-K7M', archived: true }, false), codeDeLaCarte({ graine: graineDe('ADJOA-Q2X'), archived: true }, false),
          codeDeLaCarte({ codeParrain: 'adjoa' }, false)]);
      const carte = sansCommentaires(lit(CARTE));
      vrai('Ma Couronne lit le lancement pour ouvrir la carte', /return donneesDeMaCarte\(client, !!lunes\.lanceLe\);/.test(carte) && /const code = codeDeLaCarte\(client, lance\);/.test(carte));
      vrai('... l accueil et l ambassade passent par la meme porte', /const maCarte = useMaCarte\(\);/.test(sansCommentaires(lit(ONGLETS))) && /const donnees = useMaCarte\(\);/.test(carte));
      return ecarts;
    },
    pannes: [
      { nom: 'le code d une amie repart dans code (l ancienne Edge l honorerait)', mute: [P(RESERVER, '? { codeAmie: codeNormalise(code) } : {}),', '? { code: codeNormalise(code) } : {}),')] },
      { nom: 'l Edge neuve ignore codeAmie', mute: [P(EDGE, 'const codeEcrit = d.codeAmie ?? d.code;', 'const codeEcrit = d.code;')] },
      { nom: 'l ancienne carte survit au lancement', mute: [P(POUR, '  if (lance || fiche.archived) return null;', '  if (fiche.archived) return null;')] },
      { nom: 'Ma Couronne efface les cartes avant le lancement', mute: [P(CARTE, 'return donneesDeMaCarte(client, !!lunes.lanceLe);', 'return donneesDeMaCarte(client, true);')] },
    ],
  },
];

/* ── Le passage ─────────────────────────────────────────────────────── */
if (process.env.DOUZE_LUNES_LISTE) {
  console.log(JSON.stringify(regles.map((r) => ({ id: r.id, nom: r.nom, pannes: r.pannes }))));
  process.exit(0);
}
const seule = process.env.DOUZE_LUNES_REGLE;
let ko = 0;
for (const r of regles) {
  if (seule && r.id !== seule) continue;
  let ecarts: string[];
  try { ecarts = await r.eprouve(); } catch (e) { ecarts = [`plante : ${(e as Error)?.stack ?? e}`]; }
  if (ecarts.length) {
    ko += 1;
    console.log(`RATE  ${r.nom}`);
    for (const x of ecarts.slice(0, 8)) console.log(`      - ${x}`);
  } else console.log(`OK    ${r.nom}`);
}
console.log(ko === 0 ? '\nDe main en main tient.' : `\n${ko} RATE.`);
if (ko) process.exit(1);
