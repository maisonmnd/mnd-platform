/* LES MODÈLES CHEZ META ET LA PLACE TENUE, ÉPROUVÉS — `node scripts/verifie-les-modeles-chez-meta.mjs`.

   18 novembre 2026. Deux défauts relevés à la mise en ligne de « La
   consultation en affiches » (05da57f9) :
   1. `/reserver/` disait encore, dans « Ce qui se passe ensuite », « C'est
      réservé · Le créneau est à votre nom dès l'envoi », alors qu'une place
      prise en ligne naît en attente de son « Je confirme » ;
   2. `mnd_modeles_meta` a deux formes (la liste relue chez Meta, les notes
      de « Ses modèles chez Meta ») et chaque écriture effaçait l'autre : une
      note remplaçait la liste, `demande-submit` ne lisait plus
      `rdv_a_confirmer` « APPROVED », l'attente s'éteignait sans bruit.

   Parties. A : la règle pure (modeles-meta-pur). B : le VRAI Trône qui note
   (noteLeModele, son magasin) et le vrai lecteur de la prochaine séance.
   C : la VRAIE fonction modeles-meta contre une base, un Meta et un Deno
   simulés. D : chaque lecteur et chaque écrivain du document passe par la
   règle, et aucun autre n'existe. E : la base, 0236 jouée dans PGlite
   (BANC_PGLITE) avec ses écrivains d'avant, puis l'essai à blanc. F : le
   site, la vraie page /reserver/ écrite par genere-revelateur, la feuille,
   l'îlot, le billet de la consultation. Tout est inventé ; aucune vraie
   base. Sortie ASCII : la console de Windows. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  avecLaListe, avecLaNote, estApprouveChezMeta, etatDuModeleMeta, etatsConnus, modelesMetaLus, type ModeleLuChezMeta,
} from '../src/shared/modeles-meta-pur';
import { etatDuModele, etatsNotes, modelesMetaStore, noteLeModele, registreLu } from '../src/shared/modeles-meta';
import { modeleProchaineSeanceApprouve } from '../src/shared/messages-de-l-abonnee';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};
const lit = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* La liste de Meta telle que la fonction l'a gardée ce matin (noms seulement, inventés ailleurs). */
const LU_CE_MATIN = '2026-11-18T05:33:12.538Z';
const LISTE: ModeleLuChezMeta[] = [
  { id: '11', nom: 'confirmation_rdv', etat: 'APPROVED', categorie: 'UTILITY', langue: 'fr' },
  { id: '12', nom: 'consultation_privee_proposee', etat: 'APPROVED', categorie: 'UTILITY', langue: 'fr' },
  { id: '13', nom: 'proposition_rituel', etat: 'APPROVED', categorie: 'MARKETING', langue: 'fr' },
  { id: '14', nom: 'rdv_a_confirmer', etat: 'APPROVED', categorie: 'UTILITY', langue: 'fr' },
  { id: '15', nom: 'reprise_proposee', etat: 'PAUSED', categorie: 'MARKETING', langue: 'fr' },
  { id: '16', nom: 'visio_mnd', etat: 'REJECTED', categorie: 'UTILITY', langue: 'fr' },
];
const DOC_DU_MATIN = { lusLe: LU_CE_MATIN, modeles: LISTE, version: '2026-11-17-a' };
const approuves = (doc: unknown): string[] => ['rdv_a_confirmer', 'consultation_privee_proposee', 'prochaine_seance'].filter((m) => estApprouveChezMeta(doc, m));

/* ══ A. LA RÈGLE PURE ═══════════════════════════════════════════════════════ */
{
  const liste = modelesMetaLus(DOC_DU_MATIN);
  const ancien = modelesMetaLus({ modeles: { prochaine_seance: { etat: 'approuve', le: '2026-10-28T09:00:00.000Z', parQui: 'Y' }, Mauvais: { etat: 'approuve' }, x_y: { etat: 'peut-etre' } }, parQui: 'Y', le: '2026-10-28T09:00:00.000Z' });
  const ensemble = modelesMetaLus({ ...DOC_DU_MATIN, notes: { prochaine_seance: { etat: 'approuve', le: '2026-11-18T06:00:00.000Z' } }, parQui: 'Y', le: '2026-11-18T06:00:00.000Z' });
  dit('A1 les trois formes se lisent : la liste seule (6 modeles, aucune note), le registre d avant seul (sa note, les noms et etats douteux ecartes), les deux ensemble',
    [[6, 0], [0, ['prochaine_seance']], [6, ['prochaine_seance']]],
    [[liste.liste.length, Object.keys(liste.notes).length], [ancien.liste.length, Object.keys(ancien.notes)], [ensemble.liste.length, Object.keys(ensemble.notes)]]);
  dit('A2 l etat lu chez Meta : APPROVED approuve, PAUSED depose (il ne part pas), REJECTED refuse ; inconnu de tous : a deposer',
    ['approuve', 'depose', 'refuse', 'a-deposer'],
    [etatDuModeleMeta(liste, 'rdv_a_confirmer'), etatDuModeleMeta(liste, 'reprise_proposee'), etatDuModeleMeta(liste, 'visio_mnd'), etatDuModeleMeta(liste, 'prochaine_seance')]);
  dit('A3 l etat d une note seule : celle du registre d avant compte',
    ['approuve', 'approuve'], [etatDuModeleMeta(ancien, 'prochaine_seance'), etatDuModeleMeta(ensemble, 'prochaine_seance')]);
  const avec = (note: Any) => modelesMetaLus({ ...DOC_DU_MATIN, notes: { rdv_a_confirmer: note } });
  dit('A4 les deux connues, la plus recente dit vrai : une note « depose » posee apres la relecture l emporte ; posee avant, ou sans date, la liste l emporte',
    ['depose', 'approuve', 'approuve'],
    [etatDuModeleMeta(avec({ etat: 'depose', le: '2026-11-18T07:00:00.000Z' }), 'rdv_a_confirmer'),
      etatDuModeleMeta(avec({ etat: 'depose', le: '2026-11-17T07:00:00.000Z' }), 'rdv_a_confirmer'),
      etatDuModeleMeta(avec({ etat: 'depose' }), 'rdv_a_confirmer')]);
  dit('A5 un nom rendu dans deux langues est approuve si l une l est',
    'approuve', etatDuModeleMeta(modelesMetaLus({ modeles: [{ nom: 'rdv_a_confirmer', etat: 'PENDING', langue: 'en' }, { nom: 'rdv_a_confirmer', etat: 'approved', langue: 'fr' }] }), 'rdv_a_confirmer'));
  /* LE DÉFAUT DU 18 NOVEMBRE : une note sur un autre modèle, après la relecture. */
  const noteeLe = '2026-11-18T08:00:00.000Z';
  const apresNote = avecLaNote(DOC_DU_MATIN, 'prochaine_seance', 'approuve', 'Y', noteeLe);
  dit('A6 une note s AJOUTE a la liste : rdv_a_confirmer et consultation_privee_proposee restent approuves, la note est la, la liste garde sa date et sa version',
    [['rdv_a_confirmer', 'consultation_privee_proposee', 'prochaine_seance'], 6, LU_CE_MATIN, '2026-11-17-a', { etat: 'approuve', le: noteeLe, parQui: 'Y' }],
    [approuves(apresNote), apresNote.modeles?.length, apresNote.lusLe, apresNote.version, apresNote.notes?.prochaine_seance]);
  const deux = avecLaNote(apresNote, 'proposition_rituel', 'refuse', 'B', '2026-11-18T08:05:00.000Z');
  const retiree = avecLaNote(deux, 'prochaine_seance', 'a-deposer', 'Y', '2026-11-18T08:10:00.000Z');
  dit('A7 une seconde note garde la premiere ; « a deposer » retire SA note et rien d autre (la liste et l autre note restent)',
    [['prochaine_seance', 'proposition_rituel'], ['proposition_rituel'], 6, ['rdv_a_confirmer', 'consultation_privee_proposee']],
    [Object.keys(deux.notes ?? {}), Object.keys(retiree.notes ?? {}), retiree.modeles?.length, approuves(retiree)]);
  const relu: ModeleLuChezMeta[] = [{ id: '14', nom: 'rdv_a_confirmer', etat: 'APPROVED' }, { id: '17', nom: 'prochaine_seance', etat: 'PENDING' }];
  const apresRelecture = avecLaListe(deux, relu, '2026-11-18T09:00:00.000Z', 'v-essai');
  dit('A8 une relecture chez Meta garde les notes (et qui les a notees) ; sa liste neuve, sa date, sa version prennent la place',
    [['prochaine_seance', 'proposition_rituel'], 'B', 2, '2026-11-18T09:00:00.000Z', 'v-essai'],
    [Object.keys(apresRelecture.notes ?? {}), apresRelecture.parQui, apresRelecture.modeles?.length, apresRelecture.lusLe, apresRelecture.version]);
  dit('A9 apres la relecture, la plus recente dit vrai : prochaine_seance, note approuve a 8 h, relu PENDING a 9 h : depose',
    'depose', etatDuModeleMeta(modelesMetaLus(apresRelecture), 'prochaine_seance'));
  const depuisLAncien = avecLaListe({ modeles: { prochaine_seance: { etat: 'approuve' } }, parQui: 'Y' }, relu, '2026-11-18T09:00:00.000Z', 'v');
  dit('A10 une relecture sur le registre d avant : ses notes passent dans `notes`, la liste prend `modeles`',
    [true, ['prochaine_seance'], 'Y'], [Array.isArray(depuisLAncien.modeles), Object.keys(depuisLAncien.notes ?? {}), depuisLAncien.parQui]);
  dit('A11 etatsConnus : la liste et les notes, sans les « a deposer »',
    { confirmation_rdv: 'approuve', consultation_privee_proposee: 'approuve', proposition_rituel: 'approuve', rdv_a_confirmer: 'approuve', reprise_proposee: 'depose', visio_mnd: 'refuse', prochaine_seance: 'approuve' },
    etatsConnus(modelesMetaLus(apresNote)));
  dit('A12 un document illisible ne dit rien : ni approuve, ni plantage',
    [false, false, false, 'a-deposer'], [estApprouveChezMeta(null, 'rdv_a_confirmer'), estApprouveChezMeta('texte', 'rdv_a_confirmer'), estApprouveChezMeta({ modeles: 3 }, 'rdv_a_confirmer'), etatDuModeleMeta(modelesMetaLus([1, 2]), 'x')]);
}

/* ══ B. LE TRÔNE QUI NOTE, ET CE QUI LIT ════════════════════════════════════ */
{
  modelesMetaStore.set(structuredClone(DOC_DU_MATIN) as Any);
  noteLeModele('prochaine_seance', 'approuve', 'Y');
  const apres: Any = modelesMetaStore.get();
  dit('B1 « Ses modeles chez Meta » note prochaine_seance : le document garde la liste relue (rdv_a_confirmer et consultation_privee_proposee approuves), la note s y ajoute',
    [6, LU_CE_MATIN, ['rdv_a_confirmer', 'consultation_privee_proposee', 'prochaine_seance'], 'approuve', 'Y'],
    [Array.isArray(apres.modeles) ? apres.modeles.length : 0, apres.lusLe, approuves(apres), apres.notes?.prochaine_seance?.etat, apres.notes?.prochaine_seance?.parQui]);
  dit('B2 le lecteur de la prochaine seance (messages de l abonnee) la lit approuvee ; le Trone dit les etats de la liste ET de la note',
    [true, 'approuve', 'approuve', 'depose'],
    [modeleProchaineSeanceApprouve(), etatDuModele(registreLu(apres), 'rdv_a_confirmer'), etatsNotes(registreLu(apres)).prochaine_seance, etatsNotes(registreLu(apres)).reprise_proposee]);
  noteLeModele('prochaine_seance', 'a-deposer', 'Y');
  const retiree: Any = modelesMetaStore.get();
  dit('B3 « a deposer » retire la note : la liste reste, rdv_a_confirmer toujours approuve, la prochaine seance plus approuvee',
    [6, ['rdv_a_confirmer', 'consultation_privee_proposee'], false], [retiree.modeles?.length, approuves(retiree), modeleProchaineSeanceApprouve()]);
  modelesMetaStore.set({ modeles: { prochaine_seance: { etat: 'approuve' } }, parQui: 'Y' } as Any);
  const ancienLu = modeleProchaineSeanceApprouve();
  noteLeModele('rdv_a_confirmer', 'approuve', 'B');
  const deuxNotes: Any = modelesMetaStore.get();
  dit('B4 un poste qui garde le registre d avant : il se lit encore ; une note neuve garde l ancienne',
    [true, ['prochaine_seance', 'rdv_a_confirmer']], [ancienLu, Object.keys(deuxNotes.notes ?? {}).sort()]);
  modelesMetaStore.set({ lusLe: LU_CE_MATIN, modeles: [{ id: '9', nom: 'prochaine_seance', etat: 'APPROVED' }] } as Any);
  dit('B5 la liste seule, relue chez Meta, suffit a la prochaine seance (avant ce jour, seule une note la faisait partir)', true, modeleProchaineSeanceApprouve());
}

/* ══ C. LA VRAIE FONCTION modeles-meta ═══════════════════════════════════════ */
{
  const ENV: Record<string, string> = { SUPABASE_URL: 'http://faux', CLE_SERVICE: 'cle-service-du-banc', WA_TOKEN: 'jeton-du-banc', WA_WABA_ID: '424242' };
  const DOCS = new Map<string, unknown>();
  let lectureEnPanne = false;
  let ecritures = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(t: string) {
      const q: Any = { t, filtres: [] as [string, unknown][] };
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { q.filtres.push([c, v]); return q; };
      q.maybeSingle = async () => {
        if (t !== 'documents') return { data: null, error: null };
        if (lectureEnPanne) return { data: null, error: { message: 'panne du banc' } };
        const cle = q.filtres.find(([c]: [string]) => c === 'key')?.[1] as string;
        return { data: DOCS.has(cle) ? { data: structuredClone(DOCS.get(cle)) } : null, error: null };
      };
      q.upsert = async (ligne: { key: string; data: unknown }) => { ecritures++; DOCS.set(ligne.key, structuredClone(ligne.data)); return { error: null }; };
      return q;
    },
  };
  const META_REND = [
    { id: '14', name: 'rdv_a_confirmer', status: 'APPROVED', category: 'UTILITY', language: 'fr' },
    { id: '12', name: 'consultation_privee_proposee', status: 'APPROVED', category: 'UTILITY', language: 'fr' },
    { id: '17', name: 'prochaine_seance', status: 'PENDING', category: 'UTILITY', language: 'fr' },
  ];
  (globalThis as Any).__faux = { client: () => client };
  const SERVIS: Any[] = [];
  (globalThis as Any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: Any) => { SERVIS.push(h); } };
  const fetchReel = globalThis.fetch;
  (globalThis as Any).fetch = async (url: string) => {
    if (String(url).startsWith('https://graph.facebook.com/v20.0/424242/message_templates')) {
      return new Response(JSON.stringify({ data: META_REND, paging: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: 'inconnu du banc' } }), { status: 404 });
  };
  await import('../supabase/functions/modeles-meta/index.ts');
  const servir = SERVIS[0];
  const lire = async () => {
    const r: Response = await servir(new Request('http://faux/modeles-meta', {
      method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ geste: 'lire' }),
    }));
    return { statut: r.status, corps: await r.json() as Any };
  };
  const noteDuMatin = { prochaine_seance: { etat: 'approuve', le: '2026-11-18T06:00:00.000Z', parQui: 'Y' }, proposition_rituel: { etat: 'refuse', le: '2026-11-18T06:01:00.000Z', parQui: 'B' } };

  DOCS.set('mnd_modeles_meta', { ...DOC_DU_MATIN, notes: noteDuMatin, parQui: 'B', le: '2026-11-18T06:01:00.000Z' });
  const r1 = await lire();
  const d1: Any = DOCS.get('mnd_modeles_meta');
  dit('C1 « Relire chez Meta » : la liste neuve prend la place (3 modeles, sa date, la version de la fonction), les deux notes et qui les a notees restent',
    [200, 3, true, true, ['prochaine_seance', 'proposition_rituel'], 'B', 3],
    [r1.statut, d1.modeles?.length, d1.lusLe === r1.corps.lusLe && d1.lusLe > LU_CE_MATIN, /^2026-11-18-/.test(String(d1.version)), Object.keys(d1.notes ?? {}), d1.parQui, r1.corps.modeles?.length]);
  dit('C2 apres la relecture, rdv_a_confirmer et consultation_privee_proposee approuves ; prochaine_seance relue PENDING apres sa note : deposee',
    [['rdv_a_confirmer', 'consultation_privee_proposee'], 'depose'], [approuves(d1), etatDuModeleMeta(modelesMetaLus(d1), 'prochaine_seance')]);

  DOCS.set('mnd_modeles_meta', { modeles: { prochaine_seance: { etat: 'approuve' } }, parQui: 'Y', le: '2026-10-28T09:00:00.000Z' });
  await lire();
  const d2: Any = DOCS.get('mnd_modeles_meta');
  dit('C3 sur le registre d avant (une note, aucune liste) : la relecture garde la note, dans `notes`, et pose la liste',
    [true, ['prochaine_seance'], 'Y'], [Array.isArray(d2.modeles), Object.keys(d2.notes ?? {}), d2.parQui]);

  DOCS.set('mnd_modeles_meta', { ...DOC_DU_MATIN, notes: noteDuMatin });
  lectureEnPanne = true;
  const avant = ecritures;
  const r3 = await lire();
  lectureEnPanne = false;
  const d3: Any = DOCS.get('mnd_modeles_meta');
  dit('C4 le document illisible : rien ne s ecrit (une liste seule effacerait les notes), la liste lue est rendue quand meme',
    [0, ['prochaine_seance', 'proposition_rituel'], 3], [ecritures - avant, Object.keys(d3.notes ?? {}), r3.corps.modeles?.length]);

  DOCS.delete('mnd_modeles_meta');
  await lire();
  const d4: Any = DOCS.get('mnd_modeles_meta');
  dit('C5 sans document : il naît avec la liste, sans note', [3, {}], [d4?.modeles?.length, d4?.notes]);
  globalThis.fetch = fetchReel;
}

/* ══ D. CHAQUE LECTEUR ET CHAQUE ÉCRIVAIN PASSE PAR LA RÈGLE ═══════════════ */
{
  const fichiers: string[] = [];
  const marche = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = `${d}/${f}`;
      if (statSync(p).isDirectory()) { if (f !== 'node_modules') marche(p); } else if (/\.(ts|tsx)$/.test(f)) fichiers.push(p);
    }
  };
  marche('src'); marche('supabase/functions');
  const lecteurs = fichiers.filter((f) => lit(f).includes("'mnd_modeles_meta'")).sort();
  /** Chaque fichier qui nomme le document : ce qu'il doit appeler, ce qu'il ne doit plus faire à la main. */
  const ATTENDUS: Record<string, { appelle: string[]; plusJamais: RegExp[] }> = {
    'src/apps/trone/routes/clients/ModelesMeta.tsx': { appelle: ['const garde = modelesMetaLus(doc?.data);'], plusJamais: [/Array\.isArray\(garde/] },
    'src/apps/trone/routes/vente/SonProchainRituel.tsx': { appelle: ['const lu = modelesMetaLus(data?.data);', "setEtat(etatDuModeleMeta(lu, nom) === 'approuve');"], plusJamais: [/'APPROVED'/] },
    'src/shared/modeles-meta.ts': { appelle: ['modelesMetaStore.set((prev) => avecLaNote(prev, nom, etat, parQui, le));', 'export const registreLu = (brut: unknown): ModelesMetaLus => modelesMetaLus(brut);'], plusJamais: [/return \{ modeles, parQui, le \}/] },
    'supabase/functions/demande-submit/index.ts': { appelle: ["  return estApprouveChezMeta(data?.data, nom) ? nom : '';"], plusJamais: [] },
    'supabase/functions/modeles-meta/index.ts': { appelle: ["data: avecLaListe(avant?.data, modeles, lusLe, VERSION) }"], plusJamais: [/data: \{ lusLe, modeles, version: VERSION \}/] },
  };
  dit('D1 les fichiers qui lisent ou ecrivent mnd_modeles_meta sont ceux-la, et aucun autre (un lecteur neuf doit passer par la regle et s inscrire ici)',
    Object.keys(ATTENDUS).sort(), lecteurs);
  const ecarts: string[] = [];
  for (const [f, a] of Object.entries(ATTENDUS)) {
    let t = '';
    try { t = lit(f); } catch { ecarts.push(`${f} absent`); continue; }
    /* La copie de la règle se lit à part : ce qui compte est l'appel. */
    const i = t.indexOf('/* ⟨modeles-meta⟩ */');
    const k = t.indexOf('/* ⟨/modeles-meta⟩ */');
    const horsCopie = i >= 0 && k > i ? t.slice(0, i) + t.slice(k) : t;
    for (const x of a.appelle) if (!horsCopie.includes(x)) ecarts.push(`${f} : n appelle plus « ${x.slice(0, 60)} »`);
    for (const r of a.plusJamais) if (r.test(horsCopie)) ecarts.push(`${f} : lit ou ecrit encore a la main (${r})`);
  }
  const ds = lit('supabase/functions/demande-submit/index.ts');
  const bascule = ds.slice(ds.indexOf('async function modeleDeLAttenteOuvert('), ds.indexOf('/** Ce numéro a-t-il encore droit à un modèle du site'));
  if (/APPROVED|\.modeles\b|'approuve'/.test(bascule)) ecarts.push('demande-submit : la bascule relit le document a la main');
  dit('D2 chacun passe par la regle (modelesMetaLus, estApprouveChezMeta, avecLaNote, avecLaListe) ; plus personne ne le lit ni ne l ecrit a la main', [], ecarts);
  dit('D3 les deux fonctions portent la regle entre ses reperes', [true, true],
    ['supabase/functions/demande-submit/index.ts', 'supabase/functions/modeles-meta/index.ts'].map((f) => /\/\* ⟨modeles-meta⟩ \*\/\n[\s\S]{200,}\n\/\* ⟨\/modeles-meta⟩ \*\//.test(lit(f))));
}

/* ══ E. LA BASE : 0236 DANS PGLITE ═══════════════════════════════════════════ */
type Base = { exec: (q: string) => Promise<unknown>; query: <T = Any>(q: string, p?: unknown[]) => Promise<{ rows: T[] }>; close: () => Promise<void> };
{
  const dossierPGlite = process.env.BANC_PGLITE;
  let PGlite: (new () => Base) | null = null;
  /* PGlite se croit dans un navigateur devant les faux `window` et `document` du Trône : ils partent. */
  delete (globalThis as Any).window;
  delete (globalThis as Any).document;
  if (dossierPGlite) {
    try { PGlite = (await import(pathToFileURL(path.join(dossierPGlite, 'node_modules/@electric-sql/pglite/dist/index.js')).href)).PGlite ?? null; } catch { PGlite = null; }
  }
  if (!PGlite) {
    console.log('SAUTE E 0236 ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
  } else {
    const base = new PGlite();
    await base.exec(`create table public.documents (key text primary key, data jsonb, updated_at timestamptz not null default now());`);
    await base.exec(lit('supabase/migrations/0236_les_modeles_meta_gardent_leurs_deux_formes.sql'));
    /* L'écriture du Trône et des fonctions : l'upsert de PostgREST. */
    const ecris = (cle: string, data: unknown) => base.query('insert into public.documents (key, data) values ($1, $2::jsonb) on conflict (key) do update set data = excluded.data', [cle, JSON.stringify(data)]);
    const ligne = async (cle = 'mnd_modeles_meta'): Promise<Any> => (await base.query<{ data: Any }>('select data from public.documents where key = $1', [cle])).rows[0]?.data;
    await ecris('mnd_modeles_meta', DOC_DU_MATIN);
    const premiere = await ligne();
    dit('E0 la premiere ecriture (la ligne n existait pas) passe telle quelle', [6, LU_CE_MATIN], [premiere?.modeles?.length, premiere?.lusLe]);

    /* 1. Un Trône d'avant le 18 novembre, resté en cache : l'ancien registre, sans liste. */
    await ecris('mnd_modeles_meta', { modeles: { prochaine_seance: { etat: 'approuve', le: '2026-11-18T08:00:00.000Z', parQui: 'Y' } }, parQui: 'Y', le: '2026-11-18T08:00:00.000Z' });
    const e1 = await ligne();
    dit('E1 un Trone d avant note dans l ancienne forme : la base garde la liste (rdv_a_confirmer, consultation_privee_proposee approuves), la note passe dans `notes`',
      [6, LU_CE_MATIN, ['rdv_a_confirmer', 'consultation_privee_proposee', 'prochaine_seance'], ['prochaine_seance'], 'Y'],
      [e1?.modeles?.length, e1?.lusLe, approuves(e1), Object.keys(e1?.notes ?? {}), e1?.parQui]);
    await ecris('mnd_modeles_meta', { modeles: { proposition_rituel: { etat: 'refuse' } }, parQui: 'B', le: '2026-11-18T08:01:00.000Z' });
    const e1b = await ligne();
    dit('E1b une seconde note d un Trone d avant (qui ne voit pas la premiere) : les deux restent', ['prochaine_seance', 'proposition_rituel'], Object.keys(e1b?.notes ?? {}).sort());

    /* 2. Une fonction modeles-meta d'avant : la liste seule, plus récente. */
    await ecris('mnd_modeles_meta', { lusLe: '2026-11-18T09:00:00.000Z', modeles: LISTE.slice(0, 4), version: 'ancienne' });
    const e2 = await ligne();
    dit('E2 une relecture d avant (la liste seule) : la liste neuve passe, les notes et qui les a notees restent',
      [4, '2026-11-18T09:00:00.000Z', ['prochaine_seance', 'proposition_rituel'], 'B'],
      [e2?.modeles?.length, e2?.lusLe, Object.keys(e2?.notes ?? {}).sort(), e2?.parQui]);

    /* 3. Le Trône d'aujourd'hui, sa copie en retard : la liste de 5 h 33, et il retire une note. */
    const retard = avecLaNote({ ...DOC_DU_MATIN, notes: e2.notes }, 'proposition_rituel', 'a-deposer', 'Y', '2026-11-18T09:05:00.000Z');
    await ecris('mnd_modeles_meta', retard);
    const e3 = await ligne();
    dit('E3 un Trone d aujourd hui en retard (la liste de 5 h 33) retire une note : la note part, la liste plus recente de la base reste',
      [['prochaine_seance'], 4, '2026-11-18T09:00:00.000Z'], [Object.keys(e3?.notes ?? {}), e3?.modeles?.length, e3?.lusLe]);

    /* 4. La fonction d'aujourd'hui, une note posée entre sa lecture et son écriture. */
    const luParLaFonction = await ligne();
    await ecris('mnd_modeles_meta', avecLaNote(luParLaFonction, 'proposition_rituel', 'approuve', 'B', '2026-11-18T09:10:00.000Z'));
    await ecris('mnd_modeles_meta', avecLaListe(luParLaFonction, LISTE, '2026-11-18T09:11:00.000Z', 'neuve'));
    const e4 = await ligne();
    dit('E4 une note posee pendant une relecture n est pas perdue ; la liste neuve passe',
      [['prochaine_seance', 'proposition_rituel'], 6, 'neuve'], [Object.keys(e4?.notes ?? {}).sort(), e4?.modeles?.length, e4?.version]);

    /* 5. Les autres documents ne sont pas touchés ; ce qui n'est pas un objet passe. */
    await ecris('mnd_autre_reglage', { modeles: [1] });
    await ecris('mnd_autre_reglage', { modeles: { a: 1 } });
    const autre = await ligne('mnd_autre_reglage');
    await ecris('mnd_modeles_meta', 'texte');
    const texte = await ligne();
    await ecris('mnd_modeles_meta', DOC_DU_MATIN);
    dit('E5 un autre document s ecrit tel quel ; une ecriture qui n est pas un objet aussi', [{ modeles: { a: 1 } }, 'texte'], [autre, texte]);

    /* 6. L'essai à blanc, sur la ligne du matin : TIENT, et rien ne reste. */
    await ecris('mnd_modeles_meta', { ...DOC_DU_MATIN, notes: {} });
    const avantEssai = JSON.stringify(await ligne());
    let message = '';
    try { await base.exec(lit('supabase/essai_0236_a_blanc.sql')); } catch (e) { message = String((e as Error)?.message ?? e); }
    dit('E6 l essai a blanc dit TIENT sur la ligne du matin, et la ligne n a pas bouge',
      [true, true], [/^ESSAI 0236 : TIENT /.test(message), JSON.stringify(await ligne()) === avantEssai]);
    if (!/TIENT/.test(message)) console.log(`       essai : ${ascii(message.slice(0, 300))}`);
    await base.close();
  }
}

/* ══ F. LE SITE : CE QUI SE PASSE ENSUITE ════════════════════════════════════ */
{
  const g = spawnSync(process.execPath, ['scripts/genere-revelateur.mjs'], { encoding: 'utf8', timeout: 180_000, env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
  dit('F0 genere-revelateur ecrit le site', 0, g.status);
  const page = (c: string): string => { try { return lit(`revelateur${c}index.html`); } catch { return ''; } };
  const reserver = page('/reserver/');
  const ensuite = (/<aside class="ensuite">([\s\S]*?)<\/aside>/.exec(reserver) ?? [])[1] ?? '';
  const liste = (classe: string, html: string): string => (new RegExp(`<ol class="${classe}">([\\s\\S]*?)</ol>`).exec(html) ?? [])[1] ?? '';
  const attente = liste('ensuite__attente', ensuite);
  const ferme = liste('ensuite__ferme', ensuite);
  const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  dit('F1 /reserver/, ce qui se passe ensuite (montre avant l envoi) : la place est tenue, elle se confirme par « Je confirme » sur WhatsApp ; ni « C est reserve » ni « a votre nom des l envoi »',
    [true, true, true, false, false],
    [/tenue/.test(attente), /« Je confirme »/.test(texte(attente)), /se lib/.test(attente), /C’est réservé|C'est réservé/.test(attente), /dès l[’']envoi/.test(attente)]);
  dit('F2 … court : trois etapes, moins de quarante mots', [3, true], [(attente.match(/<li>/g) ?? []).length, texte(attente).split(' ').length < 40]);
  dit('F3 la suite ferme est ecrite a cote, pour le jour ou le serveur rend la place ferme (etat « confirme ») ; elle ne parle pas de « Je confirme »',
    [3, false], [(ferme.match(/<li>/g) ?? []).length, /Je confirme/.test(ferme)]);
  const rappel = page('/rappel/');
  dit('F4 /rappel/ garde sa suite a lui, sans place', [true, false, false],
    [/<ol class="ensuite__rappel">/.test(rappel), /ensuite__attente|ensuite__ferme/.test(rappel), /« Je confirme »/.test(rappel)]);
  const toutes: string[] = [];
  const marche = (d: string) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) marche(p); else if (f === 'index.html') toutes.push(p); } };
  marche('revelateur');
  dit('F5 aucune page du site ne promet « Le creneau est a votre nom des l envoi »', [],
    toutes.filter((p) => /à votre nom dès l[’']envoi/.test(lit(p))));
  const css = lit('src/apps/revelateur/revelateur.css');
  dit('F6 la feuille : la suite ferme cachee d abord ; sous « est-ferme », elle seule se montre', [true, true, true],
    [css.includes('.ensuite .ensuite__ferme { display: none; }'), css.includes('body.est-ferme .ensuite .ensuite__attente { display: none; }'), css.includes('body.est-ferme .ensuite .ensuite__ferme { display: block; }')]);
  const ilot = lit('src/apps/revelateur/ilots/Reserver.tsx');
  dit('F7 l ilot pose « est-ferme » quand, et seulement quand, le serveur rend la place ferme', [true, true],
    [ilot.includes("document.body.classList.toggle('est-ferme', recu?.etat === 'confirme');"),
      ilot.includes("} : r.confirme === true ? { etat: 'confirme' as const } : {}),")]);
  const portes = lit('src/apps/revelateur/ilots/PortesDeLaConsultation.tsx');
  const billet = (/<p className="ca-sur">\{recu\.genre === 'privee'[^\n]*<\/p>/.exec(portes) ?? [''])[0];
  dit('F8 /consultation/ : le billet d un rituel en attente dit « Place tenue », pas « C est reserve »', [true, true],
    [billet.includes("recu.etat === 'en-attente' ? 'Place tenue'"), billet.indexOf("'Place tenue'") < billet.indexOf("'C’est réservé'")]);
  /* Plus de diagnostic sans rendez-vous (18 novembre 2026) : la bande de fin des pages publiques non plus. */
  const avecLaBande = toutes.filter((p) => lit(p).includes('Votre couronne, à votre tour.'));
  dit('F9 la bande de fin des pages publiques ne promet plus « un diagnostic » a part : « un rendez-vous, ou simplement un mot »',
    [true, []], [avecLaBande.length > 10 && avecLaBande.every((p) => lit(p).includes('La Maison vous attend à Cotonou : un rendez-vous, ou simplement un mot.')),
      toutes.filter((p) => /un diagnostic, un rendez-vous/.test(lit(p)))]);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? `, ${ko} en echec` : ''}.`);
process.exit(ko ? 1 : 0);
