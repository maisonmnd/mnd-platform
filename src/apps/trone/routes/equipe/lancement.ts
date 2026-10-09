/* DE MAIN EN MAIN, LE GESTE DU LANCEMENT — 9 octobre 2026 (étape É5).
   Sur le modèle d'« Ouvrir octobre » (finances/bascule.ts) : la règle vit
   dans `shared/douze-lunes-pur.ts` ; ici, les magasins qu'elle réécrit,
   chacun par sa propre synchronisation (envoi par tranches, garde-fous
   intacts). C'est un geste de la MAIN : il écrit par les magasins
   directement, jamais par `gardeLEcriture`, qui tient en laisse les seuls
   automatismes.

   Rien ne s'efface. Chaque fiche range dans son archive
   (`avantLesDouzeLunes`) ce qu'elle portait avant, une fois pour toutes ;
   le réglage `mnd_parrainage` garde l'ancien sous la même clé. Le retour
   en arrière rend tout. `mnd_douze_lunes.lanceLe` se pose EN DERNIER : tant
   qu'il manque, aucune Graine ne se pose seule et aucun merci ne part.

   Toutes les fiches de la Maison, toutes branches : un code vaut pour toute
   la Maison. Aucune exclusion (décision de la direction, 9 octobre 2026). */
import { clientsStore, type Client } from '../../../../shared/clients';
import { appointmentsStore } from '../../../../shared/agenda';
import { demandesStore } from '../../../../shared/demandes';
import { parrainageStore, type DemandeParrainee } from '../../../../shared/parrainage';
import { douzeLunesStore } from '../../../../shared/douze-lunes';
import { jourDuSalon } from '../../../../shared/envois';
import { supabase } from '../../../../shared/supabase';
import { lignees, recompensesAPoser, reglageDuMoteur, type DemandeLue, type RdvLu, type ReglageAmbassade } from '../../../../shared/ambassade';
import {
  attendLeLancement, codesConnus, ficheLancee, ficheRendue, grainesAAttribuer, merciDuLancement, perteDuRetour, planDuLancement,
  reglageEteint, reglageRendu, resteDuLancement, retourPossible,
  type DemandeDesLunes, type Graine, type LigneDuLancement, type PerteDuRetour, type PlanDuLancement, type RdvDesLunes, type ReglageDesLunes,
} from '../../../../shared/douze-lunes-pur';

/** Le jour de la Maison, à l'heure du Bénin, comme le moteur
    (useParrainageVivant) : une Graine posée à 0 h 30 porte le bon jour. */
export const jourDeLaMaison = (): string => jourDuSalon(new Date().toISOString()) || new Date().toISOString().slice(0, 10);

/** Ce que le juge lit du carnet. */
export const rdvsDesLunes = (rdvs: readonly { status: string; date: string; clientId?: string }[]): RdvDesLunes[] =>
  rdvs.map((a) => ({ status: a.status, date: a.date, clientId: a.clientId }));

/* ── LE PLAN ──────────────────────────────────────────────────────────── */

/** LE PLAN DU LANCEMENT sur ce que le poste porte : il ne s'écrit rien ici. */
export function planDeLaMaison(
  clients: readonly Client[], rdvs: readonly RdvDesLunes[], demandes: readonly DemandeDesLunes[],
  lunes: Partial<ReglageDesLunes>, aujourdhui = jourDeLaMaison(),
): PlanDuLancement {
  return planDuLancement(clients, rdvs, demandes, lunes, aujourdhui, new Set());
}

/** LE MÊME PLAN, relu dans les magasins au moment du geste. */
export const planDesMagasins = (aujourdhui = jourDeLaMaison()): PlanDuLancement =>
  planDeLaMaison(clientsStore.get(), rdvsDesLunes(appointmentsStore.get()), demandesStore.get() as DemandeParrainee[], douzeLunesStore.get(), aujourdhui);

/** L'EMPREINTE DE CE QUE LE PLAN ÉCRIT, fiche par fiche. Si elle change
    entre l'aperçu et le clic (un autre poste a écrit pendant la question),
    le geste s'arrête : la direction n'applique que ce qu'elle a vu. */
export const empreinteDuPlan = (plan: Pick<PlanDuLancement, 'lignes'>): string => JSON.stringify(plan.lignes.map((l) => [
  l.clientId, l.codeRetire ?? '', l.resumeVide, l.retirees.map((s) => s?.id), l.graine?.code ?? '',
]));

/* ── LE GESTE ─────────────────────────────────────────────────────────── */

/** APPLIQUE LE LANCEMENT, dans l'ordre du plan :
    ① les fiches du plan, chacune par `ficheLancee` sur son état DU MOMENT
      (une fiche déjà lancée revient telle quelle : la relance ne double rien) ;
    ② le réglage de l'ancien programme éteint (bonus de rang, défi,
      classement dans Ma Couronne, et depuis le 9 octobre au soir le
      remerciement WhatsApp), l'ancien gardé : une ceinture de plus contre un
      vieux poste resté ouvert (`reglageEteint`) ;
    ③ EN DERNIER, `lanceLe`, avec le remerciement d'avant le geste repris
      dans le document du programme. Une relance garde l'instant du premier
      geste. */
export function appliqueLeLancement(
  plan: { lignes: readonly Pick<LigneDuLancement, 'clientId' | 'graine'>[] }, le = new Date().toISOString(), lancePar?: string,
): { touchees: number } {
  const parFiche = new Map(plan.lignes.map((l) => [l.clientId, l]));
  let touchees = 0;
  clientsStore.set((prev) => prev.map((c) => {
    const l = c ? parFiche.get(c.id) : undefined;
    if (!l) return c;
    const apres = ficheLancee(c, l, le);
    if (apres !== c) touchees += 1;
    return apres;
  }));
  let merci = false;
  parrainageStore.set((r) => {
    const eteint = reglageEteint(r, le);
    merci = merciDuLancement(eteint);
    return eteint;
  });
  douzeLunesStore.set((l) => {
    if (l.lanceLe) return l;
    const { annuleLe: _annule, ...reste } = l;
    return { ...reste, merciParWhatsApp: merci, lanceLe: le, ...(lancePar ? { lancePar } : {}) };
  });
  return { touchees };
}

/** CE QUI N'EST PAS ENCORE APPLIQUÉ : les fiches du plan que la
    synchronisation n'a pas gardées (sa garde de masse peut abandonner une
    poussée en silence et réaligner le poste). 0 : le lancement est complet. */
export const resteAFaire = (plan: Pick<PlanDuLancement, 'lignes'>): number =>
  resteDuLancement(clientsStore.get(), plan).length;

/** APRÈS LE LANCEMENT, LES FICHES QUI PORTENT ENCORE L'ANCIEN PROGRAMME sans
    archive : une poussée perdue, ou un vieux poste qui a reposé un ancien
    code. Le moteur ne leur pose pas de Graine (il effacerait l'ancien code
    sans l'archiver) : la main les range, nom par nom. */
export const fichesEnRetard = (clients: readonly Client[]): Client[] => clients.filter((c) => c && attendLeLancement(c));

/* ── LES MERCIS QUE LE GESTE LIBÈRE — 9 octobre 2026 ──────────────────────
   Poser des Graines (le lancement, l'accord de la direction, un N baissé)
   libère au passage suivant du moteur les mercis des amies déjà venues
   (décision 5). L'écran les compte AVANT le geste, et dit combien de
   remerciements partiraient : rien ne s'annonce « sans message » sans
   l'avoir compté. Le compte est celui du moteur, sur les fiches d'après. */
export type MercisQuiSuivent = { mercis: number; messages: number };
export function mercisQuiSuivent(
  fichesApres: readonly Client[], rdvs: readonly RdvLu[], demandes: readonly DemandeLue[],
  reglage: ReglageAmbassade, seulement?: ReadonlySet<string>, aujourdhui = jourDeLaMaison(),
): MercisQuiSuivent {
  if (!reglage.lanceLe) return { mercis: 0, messages: 0 };
  const poses = recompensesAPoser(fichesApres, lignees(fichesApres, demandes, rdvs), reglage, aujourdhui);
  let mercis = 0;
  for (const [id, neuves] of poses.parFiche) if (!seulement || seulement.has(id)) mercis += neuves.length;
  const messages = poses.mercis.filter((m) => !seulement || seulement.has(m.clientId)).length;
  return { mercis, messages };
}

/** Ce que l'accord des Graines libère : les fiches d'après, le réglage du
    moteur tel qu'il le lira. */
export function mercisDesGraines(
  clients: readonly Client[], graines: readonly { clientId: string; graine: Graine }[], rdvs: readonly RdvLu[], demandes: readonly DemandeLue[],
  reglage: ReglageAmbassade, lunes: Partial<ReglageDesLunes>, aujourdhui = jourDeLaMaison(),
): MercisQuiSuivent {
  const parFiche = new Map(graines.map((g) => [g.clientId, g.graine]));
  const apres = clients.map((c) => {
    const g = c ? parFiche.get(c.id) : undefined;
    return g && !c.graine ? { ...c, graine: g, codeParrain: g.code } : c;
  });
  const lanceLe = lunes.lanceLe ? jourDuSalon(lunes.lanceLe) || undefined : undefined;
  return mercisQuiSuivent(apres, rdvs, demandes, reglageDuMoteur(reglage, lunes, lanceLe), new Set(parFiche.keys()), aujourdhui);
}

/** Ce que le lancement libère : chaque fiche du plan lancée, le jour du
    geste comme jour du lancement, le remerciement que le geste reprendra. */
export function mercisDuLancement(
  clients: readonly Client[], plan: Pick<PlanDuLancement, 'lignes'>, rdvs: readonly RdvLu[], demandes: readonly DemandeLue[],
  reglage: ReglageAmbassade, aujourdhui = jourDeLaMaison(),
): MercisQuiSuivent {
  const parFiche = new Map(plan.lignes.map((l) => [l.clientId, l]));
  const apres = clients.map((c) => (c && parFiche.has(c.id) ? ficheLancee(c, parFiche.get(c.id), `${aujourdhui}T12:00:00.000Z`) : c));
  return mercisQuiSuivent(apres, rdvs, demandes, reglageDuMoteur(reglage, { merciParWhatsApp: merciDuLancement(reglage) }, aujourdhui), undefined, aujourdhui);
}

/* ── LES GRAINES DE LA MAIN ───────────────────────────────────────────── */

/** LES GRAINES QUE LE TRÔNE POSERAIT avec ce N : exactement le calcul de
    l'automatisme (useParrainageVivant ③), sur les mêmes lectures, pour que
    la liste montrée soit celle qui s'écrit. */
export function grainesEnAttente(
  clients: readonly Client[], rdvs: readonly RdvDesLunes[], demandes: readonly DemandeDesLunes[], seuil: number, aujourdhui = jourDeLaMaison(),
): { clientId: string; graine: Graine }[] {
  return grainesAAttribuer(clients.filter((c) => c && !attendLeLancement(c)), rdvs, seuil, aujourdhui, codesConnus(clients, demandes), new Set());
}

/** LA MAIN POSE LES GRAINES : au-delà de PLAFOND_SANS_MAIN, que le moteur
    n'écrit jamais seul, ou quand la direction baisse N. Un seul geste : les
    Graines, puis le nouveau N s'il est donné. Le geste n'envoie rien ; les
    mercis qu'il libère (`mercisDesGraines`) se posent ensuite, en silence
    pour les amies venues avant la Graine. */
export function poseLesGraines(graines: readonly { clientId: string; graine: Graine }[], seuil?: number): number {
  const parFiche = new Map(graines.map((g) => [g.clientId, g.graine]));
  let posees = 0;
  clientsStore.set((prev) => prev.map((c) => {
    const g = c ? parFiche.get(c.id) : undefined;
    if (!g || c.graine || c.archived || attendLeLancement(c)) return c;
    posees += 1;
    return { ...c, graine: g, codeParrain: g.code };
  }));
  if (seuil !== undefined) douzeLunesStore.set((l) => ({ ...l, seuilGraine: seuil }));
  return posees;
}

/* ── LE RETOUR EN ARRIÈRE (la direction seule) ────────────────────────── */

/** ① LE DOCUMENT D'ABORD : `lanceLe` retiré, l'instant gardé dans
    `annuleLe`. Dès lors aucune Graine ne se pose et aucun merci ne part. */
export function retireLeLancement(le = new Date().toISOString()): void {
  douzeLunesStore.set((l) => {
    const { lanceLe: _lance, ...reste } = l;
    return { ...reste, annuleLe: le };
  });
}

/** ② LE SERVEUR DOIT L'AVOIR RELU avant qu'on rende les fiches : la garde en
    base (0124) lit `lanceLe` dans `documents`, et tant qu'il y est, elle
    refuse l'ancien code rendu et les échos qui reviennent. On relit le
    document au serveur, toutes les secondes et demie, trente secondes au
    plus. Sans serveur (poste local), rien à attendre. */
export async function serveurSansLancement(delaiMs = 30_000): Promise<boolean> {
  const sb = supabase;
  if (!sb) return true;
  const fin = Date.now() + delaiMs;
  for (;;) {
    const { data, error } = await sb.from('documents').select('data').eq('key', 'mnd_douze_lunes').maybeSingle();
    if (!error && !(data?.data as { lanceLe?: string } | null | undefined)?.lanceLe) return true;
    if (Date.now() >= fin) return false;
    await new Promise((r) => window.setTimeout(r, 1500));
  }
}

/** ③ LES FICHES RENDUES (code, résumé, récompenses rangées ; les mercis
    posés depuis restent ; Graine et archive retirées), puis le réglage. */
export function rendsLesFiches(): number {
  let rendues = 0;
  clientsStore.set((prev) => prev.map((c) => {
    if (!c || (!c.avantLesDouzeLunes && !c.graine)) return c;
    rendues += 1;
    return ficheRendue(c);
  }));
  parrainageStore.set((r) => reglageRendu(r));
  return rendues;
}

/** Ce qui n'est pas encore rendu : 0 quand le retour est complet. */
export const resteDuRetour = (): number => clientsStore.get().filter((c) => c && (c.avantLesDouzeLunes || c.graine)).length;

/** CE QUE LE RETOUR PERDRAIT, sur ce que le poste porte (voir
    `perteDuRetour`). Vide : le retour est permis. */
export const perteDesMagasins = (): PerteDuRetour => perteDuRetour(clientsStore.get(), demandesStore.get() as DemandeParrainee[]);

/** « 2 mercis posés depuis le lancement, 1 code de Graine déjà utilisé ». */
export const perteDite = (p: PerteDuRetour): string => [
  p.mercis.length ? `${p.mercis.length} merci${p.mercis.length > 1 ? 's' : ''} posé${p.mercis.length > 1 ? 's' : ''} depuis le lancement` : '',
  p.codes.length ? `${p.codes.length} code${p.codes.length > 1 ? 's' : ''} de Graine déjà utilisé${p.codes.length > 1 ? 's' : ''} par une amie` : '',
].filter(Boolean).join(', ');

/** LE RETOUR, dans l'ordre : le document, l'attente du serveur, les fiches.
    Si le serveur ne l'a pas relu à temps, rien n'est rendu (le document
    reste sans `lanceLe`, ce qui est sûr) et la direction recommence. Depuis
    le 9 octobre au soir, il est REFUSÉ dès que la fenêtre a donné quelque
    chose qu'une relance perdrait (`perteDuRetour`) : rien ne s'écrit. */
export async function annuleLeLancement(): Promise<{ ok: true; rendues: number } | { ok: false; pourquoi: string; bloque: 'perte' | 'serveur' }> {
  const perte = perteDesMagasins();
  if (!retourPossible(perte)) {
    return { ok: false, bloque: 'perte', pourquoi: `Le retour perdrait ce que le programme a déjà donné (${perteDite(perte)}) : rien n’a été changé.` };
  }
  retireLeLancement();
  if (!await serveurSansLancement()) {
    return { ok: false, bloque: 'serveur', pourquoi: 'Le serveur n’a pas encore relu l’arrêt du programme. Vérifiez le réseau, puis recommencez : rien n’a été rendu.' };
  }
  return { ok: true, rendues: rendsLesFiches() };
}
