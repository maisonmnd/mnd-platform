import { createStore, useStore, uid } from './store';
import { bindDocument } from './sync';
import { peutValider, type StatutDeContenu, type Validation } from './ia-validation-pur';
import { objetPourClaude, type Personne } from './ia-anonymise-pur';
import { bloquant } from './ia-marque-pur';
import {
  FORMATS, PILIERS, PLATEFORMES, declinaisonsDe, importeLesPlans, peutPasser, remarquesDuContenu,
  type Contenu, type Format, type PilierId, type Plateforme, type Resultats, type SourceDeLUsine,
} from './ia-contenu-pur';
import { ENTREES_DES_PLANS } from './ia-plans-des-reseaux';
import { CHAMPS_DU_BRIEF, CHAMPS_DU_SCRIPT, apresLeChangement, nouvelleSeance, nouveauScript, peutValiderLeBrief, peutValiderLeScript, type SeancePhoto, type ScriptVideo } from './ia-seance-pur';
import { articleApresLeChangement, nouvelArticle, PARCOURS, peutValiderLArticle, slugDe, type Article, type Etape } from './ia-journal-pur';
import type { ArticleRelu, PublicationRelue, ScriptRelu, SeanceRelue } from './ia-relecture-pur';
import { appelle, journalise } from './ia-centre';

/* L'ATELIER DES CONTENUS, CÔTÉ TRÔNE — 11 octobre 2026 (phase 2).

   Le calendrier des réseaux, les séances photo, les scripts vidéo, les
   articles du Journal : chacun dans son document (`mnd_ia_contenus`,
   `mnd_ia_seances`, `mnd_ia_scripts`, `mnd_ia_articles`), écrit par le Trône
   seul. Les agents proposent par la fonction `centre-de-commande` ; ce qu'ils
   rendent entre « à relire », jamais plus loin.

   Chaque geste passe par les règles pures (`peutPasser`, le gardien de la
   marque) et s'écrit au journal du Centre. */

export const contenusStore = createStore<Contenu[]>('mnd_ia_contenus', []);
export const seancesStore = createStore<SeancePhoto[]>('mnd_ia_seances', []);
export const scriptsStore = createStore<ScriptVideo[]>('mnd_ia_scripts', []);
export const articlesStore = createStore<Article[]>('mnd_ia_articles', []);
bindDocument(contenusStore, 'mnd_ia_contenus');
bindDocument(seancesStore, 'mnd_ia_seances');
bindDocument(scriptsStore, 'mnd_ia_scripts');
bindDocument(articlesStore, 'mnd_ia_articles');

export const useContenus = () => useStore(contenusStore);
export const useSeances = () => useStore(seancesStore);
export const useScripts = () => useStore(scriptsStore);
export const useArticles = () => useStore(articlesStore);

const maintenant = () => new Date().toISOString();
type Qui = { user_id: string; name: string; role: string } | null;
const nomDe = (q: Qui) => q?.name ?? 'Fondateur';

/* ── Le calendrier ─────────────────────────────────────────────────────── */
export function importeLesPlansPrepares(q: Qui): number {
  const { contenus, ajoutes } = importeLesPlans(contenusStore.get(), ENTREES_DES_PLANS, maintenant());
  if (ajoutes) contenusStore.set(contenus);
  journalise({ qui: nomDe(q), quoi: `Plans des réseaux importés : ${ajoutes} publications`, statut: 'ok' });
  return ajoutes;
}

export function nouveauContenu(o: Partial<Contenu> & { date: string; sujet: string }, q: Qui, source: Contenu['source'] = 'main'): Contenu {
  const c: Contenu = {
    id: uid(), plateformes: ['instagram'], format: 'post', pilier: '', statut: 'brouillon', source, creeLe: maintenant(), ...o,
  };
  contenusStore.set([...contenusStore.get(), c]);
  journalise({ qui: nomDe(q), quoi: `Publication ajoutée : ${c.sujet}`, entree: c.date, statut: 'ok' });
  return c;
}

/** Changer un champ remet un contenu validé à relire : ce qu'on a validé est
    ce qu'on a lu, pas ce qui a changé depuis. */
export function changeLeContenu(id: string, champs: Partial<Contenu>, q: Qui): void {
  const TEXTES: (keyof Contenu)[] = ['sujet', 'accroche', 'legende', 'appel', 'visuel', 'plateformes', 'format'];
  contenusStore.set(contenusStore.get().map((c) => {
    if (c.id !== id) return c;
    const touche = TEXTES.some((k) => k in champs && JSON.stringify(champs[k]) !== JSON.stringify(c[k]));
    const revient = touche && (c.statut === 'valide' || c.statut === 'programme');
    return { ...c, ...champs, ...(revient ? { statut: 'a-relire' as StatutDeContenu, validation: undefined } : {}) };
  }));
  void q;
}

export function retireLeContenu(id: string, q: Qui): void {
  const c = contenusStore.get().find((x) => x.id === id);
  contenusStore.set(contenusStore.get().filter((x) => x.id !== id));
  journalise({ qui: nomDe(q), quoi: `Publication retirée : ${c?.sujet ?? id}`, statut: 'ok' });
}

/** Mener un contenu au statut suivant, selon les règles. La validation porte
    le nom de celui qui valide. */
export function passeLeContenu(id: string, vers: StatutDeContenu, q: Qui, extra: Partial<Contenu> = {}): { ok: boolean; pourquoi?: string } {
  const c = contenusStore.get().find((x) => x.id === id);
  if (!c) return { ok: false, pourquoi: 'Introuvable.' };
  const avec = { ...c, ...extra };
  const v = peutPasser(avec, vers, q?.role);
  if (!v.ok) {
    journalise({ qui: nomDe(q), quoi: `Refus : « ${c.sujet} » vers ${vers}`, pourquoi: v.pourquoi, statut: 'refus' });
    return { ok: false, pourquoi: v.pourquoi };
  }
  const validation: Validation | undefined = vers === 'valide' && q ? { par: q.user_id, nom: q.name, le: maintenant(), verdict: 'oui' } : avec.validation;
  contenusStore.set(contenusStore.get().map((x) => (x.id === id ? { ...avec, statut: vers, validation, ...(vers === 'publie' && !avec.publieLe ? { publieLe: maintenant() } : {}) } : x)));
  journalise({ qui: nomDe(q), quoi: `« ${c.sujet} » : ${vers}`, entree: id, statut: 'ok' });
  return { ok: true };
}

/** Refuser renvoie au brouillon, avec le mot du fondateur. */
export function refuseLeContenu(id: string, q: Qui, mot?: string): { ok: boolean; pourquoi?: string } {
  if (!q || !peutValider(q.role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  contenusStore.set(contenusStore.get().map((x) => (x.id === id ? { ...x, statut: 'brouillon', validation: { par: q.user_id, nom: q.name, le: maintenant(), verdict: 'non', mot } } : x)));
  journalise({ qui: q.name, quoi: 'Publication refusée', entree: id, pourquoi: mot, statut: 'ok' });
  return { ok: true };
}

/** Valider d'un geste toutes les publications d'un plan qui attendent, sauf
    celles qu'une faute bloque : elles restent à relire, et on le dit. */
export function valideLePlan(plan: string, q: Qui): { valides: number; bloquees: number } {
  if (!q || !peutValider(q.role)) return { valides: 0, bloquees: 0 };
  let valides = 0, bloquees = 0;
  const le = maintenant();
  contenusStore.set(contenusStore.get().map((c) => {
    if (c.plan !== plan || c.statut !== 'a-relire') return c;
    if (bloquant(remarquesDuContenu(c))) { bloquees += 1; return c; }
    valides += 1;
    return { ...c, statut: 'valide', validation: { par: q.user_id, nom: q.name, le, verdict: 'oui', mot: 'Plan validé d’un geste' } };
  }));
  journalise({ qui: q.name, quoi: `Plan ${plan} validé : ${valides} publications`, sortie: bloquees ? `${bloquees} restent à corriger` : undefined, statut: 'ok' });
  return { valides, bloquees };
}

export function noteLesResultats(id: string, r: Resultats, q: Qui): void {
  contenusStore.set(contenusStore.get().map((c) => (c.id === id ? { ...c, resultats: { ...c.resultats, ...r } } : c)));
  journalise({ qui: nomDe(q), quoi: 'Résultats relevés', entree: id, statut: 'ok' });
}

/* ── L'usine ───────────────────────────────────────────────────────────── */
export function metAuCalendrier(s: SourceDeLUsine, choisies: readonly number[], q: Qui): number {
  const decl = declinaisonsDe(s);
  const debut = new Date(`${s.date}T12:00:00Z`);
  let n = 0;
  for (const i of choisies) {
    const d = decl[i];
    if (!d) continue;
    const jour = new Date(debut);
    jour.setUTCDate(jour.getUTCDate() + d.decalageJours);
    nouveauContenu({ date: jour.toISOString().slice(0, 10), sujet: d.sujet, plateformes: d.plateformes, format: d.format, pilier: d.pilier, origine: s.id }, q, 'usine');
    n += 1;
  }
  return n;
}

/* ── Les séances, les scripts, les articles ────────────────────────────── */
export function creeLaSeance(titre: string, date: string, q: Qui): SeancePhoto {
  const s = nouvelleSeance({ id: uid(), titre, date, maintenant: maintenant() });
  seancesStore.set([s, ...seancesStore.get()]);
  journalise({ qui: nomDe(q), quoi: `Séance photo créée : ${titre}`, statut: 'ok' });
  return s;
}
export const changeLaSeance = (id: string, champs: Partial<SeancePhoto>) =>
  seancesStore.set(seancesStore.get().map((s) => (s.id === id ? apresLeChangement(s, champs, CHAMPS_DU_BRIEF) : s)));
export const retireLaSeance = (id: string) => seancesStore.set(seancesStore.get().filter((s) => s.id !== id));

export function creeLeScript(titre: string, q: Qui): ScriptVideo {
  const s = nouveauScript({ id: uid(), titre, maintenant: maintenant() });
  scriptsStore.set([s, ...scriptsStore.get()]);
  journalise({ qui: nomDe(q), quoi: `Script vidéo créé : ${titre}`, statut: 'ok' });
  return s;
}
export const changeLeScript = (id: string, champs: Partial<ScriptVideo>) =>
  scriptsStore.set(scriptsStore.get().map((s) => (s.id === id ? apresLeChangement(s, champs, CHAMPS_DU_SCRIPT) : s)));
export const retireLeScript = (id: string) => scriptsStore.set(scriptsStore.get().filter((s) => s.id !== id));

export function creeLArticle(titre: string, q: Qui): Article {
  const a = nouvelArticle({ id: uid(), titre, maintenant: maintenant() });
  articlesStore.set([a, ...articlesStore.get()]);
  journalise({ qui: nomDe(q), quoi: `Article ouvert : ${titre}`, statut: 'ok' });
  return a;
}
export const changeLArticle = (id: string, champs: Partial<Article>) =>
  articlesStore.set(articlesStore.get().map((a) => (a.id === id ? articleApresLeChangement(a, { ...champs, ...(champs.titre !== undefined && !champs.slug ? { slug: slugDe(champs.titre) } : {}) }) : a)));
export const retireLArticle = (id: string) => articlesStore.set(articlesStore.get().filter((a) => a.id !== id));

/** Valider un brief, un script ou un article : un fondateur seulement. */
export function valideLaPiece(genre: 'seance' | 'script' | 'article', id: string, q: Qui, verdict: 'oui' | 'non'): { ok: boolean; pourquoi?: string } {
  if (!q || !peutValider(q.role)) return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  /* Le oui suit les règles de la pièce, avec ou sans l'écran. */
  if (verdict === 'oui') {
    const v = genre === 'seance' ? peutValiderLeBrief(seancesStore.get().find((x) => x.id === id) ?? { statut: 'brouillon' }, q.role)
      : genre === 'script' ? (() => { const x = scriptsStore.get().find((y) => y.id === id); return x ? peutValiderLeScript(x, q.role) : { ok: false as const, pourquoi: 'Introuvable.' }; })()
        : (() => { const x = articlesStore.get().find((y) => y.id === id); return x ? peutValiderLArticle(x, q.role) : { ok: false as const, pourquoi: 'Introuvable.' }; })();
    if (!v.ok) {
      journalise({ qui: q.name, quoi: `Refus de validation (${genre})`, entree: id, pourquoi: v.pourquoi, statut: 'refus' });
      return { ok: false, pourquoi: v.pourquoi };
    }
  }
  const validation: Validation = { par: q.user_id, nom: q.name, le: maintenant(), verdict };
  if (genre === 'seance') changeLaSeance(id, { validation, statut: verdict === 'oui' ? 'valide' : 'brouillon' });
  if (genre === 'script') changeLeScript(id, { validation, statut: verdict === 'oui' ? 'valide' : 'brouillon' });
  if (genre === 'article') changeLArticle(id, { validation, etape: verdict === 'oui' ? 'publication' : 'edition' as Etape });
  journalise({ qui: q.name, quoi: `${genre === 'seance' ? 'Séance' : genre === 'script' ? 'Script' : 'Article'} ${verdict === 'oui' ? 'validé' : 'refusé'}`, entree: id, statut: 'ok' });
  return { ok: true };
}

/* ── Les agents ────────────────────────────────────────────────────────── */
const LISTES = {
  plateformes: Object.keys(PLATEFORMES), formats: Object.keys(FORMATS), piliers: PILIERS.map((p) => p.id), parcours: Object.keys(PARCOURS),
};
export { LISTES as LISTES_DU_CONTENU };

async function demandeALAgent<T>(genre: string, corps: Record<string, unknown>, personnes: readonly Personne[], q: Qui): Promise<T & { consigne: string }> {
  const propre = objetPourClaude(corps, personnes);
  journalise({ qui: nomDe(q), quoi: `Demande à l’agent (${genre})`, entree: JSON.stringify(propre).slice(0, 300), statut: 'attente' });
  try {
    const r = await appelle<T & { consigne: string }>({ mode: 'contenu', genre, ...propre });
    journalise({ qui: nomDe(q), quoi: `Réponse de l’agent (${genre})`, statut: 'ok' });
    return r;
  } catch (e) {
    journalise({ qui: nomDe(q), quoi: `Pas de réponse de l’agent (${genre})`, statut: 'erreur', erreur: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

const enContenu = (p: PublicationRelue, consigne: string, source: Contenu['source'], origine?: string): Omit<Contenu, 'id' | 'creeLe'> => ({
  date: p.date, heure: p.heure || undefined, plateformes: p.plateformes as Plateforme[], format: p.format as Format, pilier: p.pilier as PilierId | '',
  objectif: p.objectif, sujet: p.sujet, accroche: p.accroche, legende: p.legende, appel: p.appel, visuel: p.visuel,
  statut: 'a-relire', source, consigne, origine,
});

export async function proposeLeCalendrier(o: { du: string; au: string; plateformes: Plateforme[]; objectif: string }, personnes: readonly Personne[], q: Qui): Promise<number> {
  const r = await demandeALAgent<{ publications: PublicationRelue[] }>('calendrier', o, personnes, q);
  for (const p of r.publications) nouveauContenu(enContenu(p, r.consigne, 'agent'), q, 'agent');
  return r.publications.length;
}

export async function ecrisLesDeclinaisons(s: SourceDeLUsine, resume: string, choisies: readonly number[], personnes: readonly Personne[], q: Qui): Promise<number> {
  const decl = declinaisonsDe(s);
  const debut = new Date(`${s.date}T12:00:00Z`);
  const demandees = choisies.map((i) => decl[i]).filter(Boolean).map((d) => {
    const j = new Date(debut); j.setUTCDate(j.getUTCDate() + d.decalageJours);
    return { ...d, date: j.toISOString().slice(0, 10) };
  });
  const r = await demandeALAgent<{ publications: PublicationRelue[] }>('declinaisons', { source: { genre: s.genre, titre: s.titre, resume }, declinaisons: demandees }, personnes, q);
  for (const p of r.publications) nouveauContenu(enContenu(p, r.consigne, 'usine', s.id), q, 'usine');
  return r.publications.length;
}

export async function redigeLArticle(a: Article, personnes: readonly Personne[], q: Qui): Promise<void> {
  const r = await demandeALAgent<{ article: ArticleRelu }>('article', { sujet: a.titre, parcours: a.parcours, angle: a.angle }, personnes, q);
  changeLArticle(a.id, {
    titre: r.article.titre || a.titre, description: r.article.description, motsCles: r.article.motsCles, parcours: r.article.parcours as Article['parcours'],
    angle: r.article.angle, plan: r.article.plan, corps: r.article.corps, aVerifier: r.article.aVerifier.map((fait) => ({ fait, verifie: false })),
    etape: 'verification', consigne: r.consigne, validation: undefined,
  });
}

export async function prepareLaSeance(s: SeancePhoto, personnes: readonly Personne[], q: Qui): Promise<void> {
  const r = await demandeALAgent<{ seance: SeanceRelue }>('seance', { titre: s.titre, objectif: s.objectif, concept: s.concept, campagne: s.campagne, modele: s.modele }, personnes, q);
  changeLaSeance(s.id, { ...r.seance, prises: r.seance.prises.map((p) => ({ ...p, faite: false })), statut: 'a-relire', validation: undefined, consigne: r.consigne });
}

export async function ecrisLeScript(s: ScriptVideo, personnes: readonly Personne[], q: Qui): Promise<void> {
  const r = await demandeALAgent<{ script: ScriptRelu }>('video', { titre: s.titre, plateforme: s.plateforme, duree: s.duree, sujet: s.histoire || s.titre }, personnes, q);
  changeLeScript(s.id, { ...r.script, statut: 'a-relire', validation: undefined, consigne: r.consigne });
}
