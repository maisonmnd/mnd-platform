/* ═══════════════════════════════════════════════════════════════════
   RAPPELS-D-ECHEANCE — la veille de chaque échéance, et le prix revu.

   Parcours de l'abonnée, maquette L0 validée le 20 octobre 2026
   (« construis c'est bon comme ça »), section WhatsApp :
     · DÉCISION 11 : « un rappel WhatsApp la veille de chaque échéance ».
       Le rappel part la veille, à 10 h, jamais avant ; les relances
       (`relances-factures`) ne partent qu'après le jour dû ;
     · DÉCISION 10 : le prix revu après le comptage du calibre est annoncé
       (Ma Couronne et WhatsApp) avant que les échéances changent : ancien
       prix, nouveau, écart, et l'échéance qui le porte.

   Réveillée toutes les trente minutes de 9 h à 19 h 30 par le cron, elle :
     ① lit les contrats (par pages), les formules, les pièces des contrats ;
     ② juge l'argent de chaque contrat par une COPIE BORNÉE du juge unique
        (`src/shared/abonnee-pur.ts`), éprouvée contre l'original par
        `scripts/verifie-les-messages-de-l-abonnee` ;
     ③ à partir de 10 h : pour chaque échéance qui tombe DEMAIN (une échéance
        écrite un dimanche se juge le lundi : son rappel part le dimanche),
        et pour chaque lune qui se règle demain, un rappel ;
     ④ à toute heure de son passage : pour chaque prix revu des trois
        derniers jours, l'annonce ;
     ⑤ DÉPOSE chaque message dans la salle d'attente des envois (le facteur
        `envois-partent` le porte, jamais pendant les heures calmes), à
        identifiant déterministe : une échéance, un rappel ; un prix revu,
        une annonce. Le cron peut se réveiller vingt fois.

   JAMAIS : une formule retenue (rien n'est dû), effacée, résiliée ; une
   échéance déjà réglée (versements du contrat ET de sa pièce, liens MND PAY
   payés pas encore inscrits compris) ; une lune suspendue ou après la fin du
   contrat ; un numéro de pièce dans le texte (WhatsApp le prend pour un
   téléphone) ; une civilité supposée (`appelDe`) ; une date sans son année.
   La tête portée n'a pas de numéro : on écrit à celle qui paie pour son
   foyer, en disant pour qui.

   RIEN NE PART SANS SON MODÈLE : les secrets WA_TEMPLATE_RAPPEL_ECHEANCE
   (`rappel_echeance_veille`) et WA_TEMPLATE_PRIX_REVU
   (`prix_revu_apres_comptage`) nomment les modèles approuvés par Meta.
   Sans l'un, sa moitié se tait ; sans les deux, rien ne se lit.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction.
   Déploiement : Supabase → Edge Functions → New function
   « rappels-d-echeance » → coller CE FICHIER ENTIER → Deploy, « Verify
   JWT » désactivé. Puis le cron (Integrations → Cron), `0,30 8-18 * * *`
   (de 9 h à 19 h 30 à Cotonou), SQL Snippet :
   select public.appelle_fonction_edge('rappels-d-echeance');
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── DEBUT tournee (tout le juge et la tournée : scripts/verifie-les-messages-de-l-abonnee les rejoue contre une base simulée)

const TZ = 'Africa/Porto-Novo'; // le fuseau de la Maison, pas celui du serveur

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-11-11-a · ce qui va partir : un rappel arrêté d’avance, ou d’un modèle en pause, ne se dépose pas ; M. et Mme devant le prénom';

/** Numéro béninois → format international sans « + » (copie de rappels-j1). */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ══════════════════════════════════
   « Quand on leur écrit, on écrive toujours, dans leur rendez-vous et dans
   leur messagerie WhatsApp, tout le prénom composé » (Yéman) : le prénom
   d'usage de la fiche, sinon celui que le Trône devine du nom. Recopié de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   et le banc des douze lunes tiennent la copie. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */
/* La Maison écrit « Madame Naffi ». Recopié de `src/shared/civilite.ts` ;
   `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  /* Tout le prénom composé (7 novembre 2026) : « Mme Anne Marie », jamais « Mme Anne ». */
  const prenom = prenomDUsage(d, repli);
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/* ══ LA SALLE D'ATTENTE — recopiée de rappels-j1 (src/shared/salle-des-envois.ts) ══ */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};

// ── DEBUT echeances (copie bornée de src/shared/abonnee-pur.ts, avec etatDesEcheances de echeancier.ts et decaleLeJour de ia-faits-pur.ts : l'argent d'un contrat ; scripts/verifie-les-messages-de-l-abonnee la rejoue contre l'original)
type EcheanceEcrite = { numero: number; dueIso: string; amountXof: number };
type VersementEcrit = { id: string; date: string; amountXof: number; method?: string };
type ContratEcrit = {
  id: string; clientId?: string; branchId?: string; name?: string; planId?: string; reference?: string; status?: string;
  cycle?: string; nextIso?: string; sinceIso?: string; startIso?: string; expiresIso?: string | null;
  priceXof?: number; prixConvenuXof?: number; echeances?: EcheanceEcrite[]; payments?: VersementEcrit[]; invoiceId?: string;
  calibreVendu?: string; origine?: string; resilieeLe?: string; renonceeLe?: string;
  suspendue?: { du: string; au: string; motif?: string };
  inclusPropres?: { serviceId: string; qty: number | null }[];
  prixRevu?: { le: string; ancienXof: number; nouveauXof: number; calibre?: string };
};
type FormuleEcrite = {
  id: string; name?: string; mode?: string; priceXof?: number;
  included?: { serviceId: string; qty: number | null }[]; soinsDeLaLune?: string[];
};
type PieceEcrite = { id: string; payments?: VersementEcrit[] };

const estIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
function decaleLeJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const joursEntre = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
/** LE DIMANCHE PASSE AU LUNDI : la porte de la Maison est close le dimanche. */
const jourOuvre = (iso: string): string =>
  (estIso(iso) && new Date(`${iso}T12:00:00Z`).getUTCDay() === 0 ? decaleLeJour(iso, 1) : iso);
const estUnPaquet = (plan: FormuleEcrite | undefined): boolean => plan?.mode === 'pack';
const debutDuContratLu = (sub: ContratEcrit): string =>
  (estIso(sub.startIso) ? sub.startIso : sub.sinceIso) ?? '0000-01-01';
const finDuContratLu = (sub: ContratEcrit): string | null => (estIso(sub.expiresIso) ? sub.expiresIso : null);

/** LE VERSÉ D'UN CONTRAT : ses versements et ceux de sa pièce, réunis par identifiant. */
type VersementLu = { id: string; date: string; montantXof: number };
function versementsDuContrat(sub: ContratEcrit, invoices: readonly PieceEcrite[]): VersementLu[] {
  const parId = new Map<string, VersementLu>();
  for (const p of sub.payments ?? []) {
    if (!p?.id) continue;
    parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof });
  }
  const piece = sub.invoiceId ? invoices.find((i) => i.id === sub.invoiceId) : undefined;
  for (const p of piece?.payments ?? []) {
    if (!p?.id || parId.has(p.id)) continue;
    parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof });
  }
  return [...parId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Les versements s'imputent dans l'ordre, la plus vieille échéance d'abord. */
type EcheanceImputee = EcheanceEcrite & { regleXof: number; resteXof: number; soldee: boolean };
function etatDesEcheances(echeances: readonly EcheanceEcrite[], verseXof: number): EcheanceImputee[] {
  let reserve = Math.max(0, verseXof);
  return [...echeances].sort((a, b) => a.numero - b.numero).map((e) => {
    const pris = Math.min(reserve, e.amountXof);
    reserve -= pris;
    const reste = e.amountXof - pris;
    return { ...e, regleXof: pris, resteXof: reste, soldee: reste === 0 };
  });
}

const prixParDefaut = (sub: ContratEcrit, plan: FormuleEcrite | undefined): number =>
  sub.prixConvenuXof ?? (estUnPaquet(plan) ? sub.priceXof : undefined) ?? plan?.priceXof ?? 0;
/** L'échéancier qui fait foi : celui du contrat, et lui seul. Un paquet sans
    échéancier n'a aucune date due : son reste est « à convenir avec la
    Maison », jamais en retard, jamais rappelé ni relancé. */
const echeancesDeBase = (sub: ContratEcrit): EcheanceEcrite[] =>
  (sub.echeances?.length ? [...sub.echeances].sort((a, b) => a.numero - b.numero).map((e) => ({ ...e })) : []);

/** L'ÉTAT QUI DÉCIDE DE L'ARGENT : le début de `etatDeLaFormule`, dans le même
    ordre (résiliée, effacée, retenue, terminée, en pause). Épuisée ne change
    rien à l'argent : elle se lit ici « en-cours », sauf le carnet que
    l'ancien ERP a dit épuisé (`exhausted`), épuisé pour de bon. */
function etatPourLArgent(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, jour: string, regleXof: number, retenueJours = 7,
): { etat: string; retenueJusquau?: string } {
  if (sub.resilieeLe ? sub.resilieeLe <= jour : sub.status === 'churn') return { etat: 'resiliee' };
  if (sub.origine === 'couronne' && regleXof <= 0) {
    if (sub.renonceeLe && sub.renonceeLe <= jour) return { etat: 'effacee' };
    const jusquau = jourOuvre(decaleLeJour(debutDuContratLu(sub), retenueJours));
    if (jour > jusquau) return { etat: 'effacee', retenueJusquau: jusquau };
    return { etat: 'retenue', retenueJusquau: jusquau };
  }
  const fin = finDuContratLu(sub);
  if (fin && fin < jour) return { etat: 'terminee' };
  if (sub.suspendue && sub.suspendue.du <= jour && jour <= sub.suspendue.au) return { etat: 'en-pause' };
  if (!estUnPaquet(plan) && estIso(sub.nextIso) && jour >= jourOuvre(sub.nextIso)) return { etat: 'en-pause' };
  if (sub.status === 'exhausted') return { etat: 'epuisee' };
  return { etat: 'en-cours' };
}

type EcheanceJugee = {
  numero: number; amountXof: number; dueIso: string; dueEcriteIso: string; resteXof: number;
  statut: 'reglee' | 'a-regler-aujourdhui' | 'en-retard' | 'a-venir' | 'retenue' | 'annulee'; retardJours: number;
};
type ArgentLu = {
  regleXof: number; resteXof: number; aRegleAujourdhuiXof: number; enRetardXof: number; retardJours: number;
  aVenir: { dueIso: string; montantXof: number; numero?: number; genre: 'echeance' | 'lune' }[];
  echeances: EcheanceJugee[]; prochaine?: { dueIso: string; montantXof: number }; avoirXof: number;
  echeancierAPoser?: true; aConvenirXof?: number;
};
/** L'ARGENT D'UN CONTRAT : l'échu, le retard (le LENDEMAIN de l'échéance), l'à
    venir et l'avoir. Une lune n'est jamais une dette ; un paquet sans
    échéancier non plus (« à convenir avec la Maison »). La résiliation au
    prorata n'est pas recopiée ici : seul son reste se relance (bloc
    `resiliation` de relances-factures). */
function argentDuContrat(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, invoices: readonly PieceEcrite[], jour: string,
  o: { prixXof?: number; etat?: string } = {},
): ArgentLu {
  const prix = o.prixXof ?? prixParDefaut(sub, plan);
  const regle = versementsDuContrat(sub, invoices).reduce((s, v) => s + v.montantXof, 0);
  const base = echeancesDeBase(sub);
  const etat = o.etat;
  const sansDette = etat === 'resiliee' || etat === 'effacee' || etat === 'retenue';
  const sansEcheancier = estUnPaquet(plan) && !base.length && prix > 0;
  const echeances: EcheanceJugee[] = etatDesEcheances(base, regle).map((e) => {
    const dueIso = jourOuvre(e.dueIso);
    let statut: EcheanceJugee['statut'];
    if (e.soldee) statut = 'reglee';
    else if (etat === 'retenue') statut = 'retenue';
    else if (sansDette) statut = 'annulee';
    else if (dueIso < jour) statut = 'en-retard';
    else if (dueIso === jour) statut = 'a-regler-aujourdhui';
    else statut = 'a-venir';
    return {
      numero: e.numero, amountXof: e.amountXof, dueIso, dueEcriteIso: e.dueIso, resteXof: e.resteXof, statut,
      retardJours: statut === 'en-retard' ? joursEntre(dueIso, jour) : 0,
    };
  });
  const ouvertes = echeances.filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard' || e.statut === 'a-venir');
  const aVenir: ArgentLu['aVenir'] = echeances
    .filter((e) => e.statut === 'a-venir').map((e) => ({ dueIso: e.dueIso, montantXof: e.resteXof, numero: e.numero, genre: 'echeance' as const }));
  const totalEcheancier = sansEcheancier ? prix : base.reduce((s, e) => s + e.amountXof, 0);
  const out: ArgentLu = {
    regleXof: regle,
    resteXof: ouvertes.reduce((s, e) => s + e.resteXof, 0),
    aRegleAujourdhuiXof: echeances.filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0),
    enRetardXof: echeances.filter((e) => e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0),
    retardJours: echeances.reduce((m, e) => Math.max(m, e.retardJours), 0),
    aVenir, echeances,
    avoirXof: (base.length || sansEcheancier) && etat !== 'effacee' ? Math.max(0, regle - totalEcheancier) : 0,
  };
  if (sansEcheancier && !sansDette) {
    out.echeancierAPoser = true;
    out.aConvenirXof = Math.max(0, prix - regle);
    out.resteXof = out.aConvenirXof;
  }
  if (!estUnPaquet(plan) && !sansDette && estIso(sub.nextIso) && !base.length && etat !== 'en-pause') {
    out.aVenir.push({ dueIso: jourOuvre(sub.nextIso), montantXof: prix, genre: 'lune' });
  }
  const prochaine = ouvertes[0];
  if (prochaine) out.prochaine = { dueIso: prochaine.dueIso, montantXof: prochaine.resteXof };
  else if (out.aVenir.length) out.prochaine = { dueIso: out.aVenir[0].dueIso, montantXof: out.aVenir[0].montantXof };
  return out;
}

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « lundi 2 novembre 2026 », « dimanche 1er novembre 2026 » : l'année toujours. */
const jourDitAvecLAnnee = (iso: string): string => {
  if (!estIso(iso)) return iso;
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS_DITS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[m - 1]} ${a}`;
};
/** « 70 000 F », espaces insécables. */
const francs = (n: number): string =>
  `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
// ── FIN echeances

// ── DEBUT phrases (ce que la cliente lit : l'année toujours, aucun numéro de pièce, aucune civilité supposée)

/** Le rappel ne part qu'à partir de 10 h, heure de Cotonou (la maquette). */
const HEURE_DU_RAPPEL = 10;
/** Un prix revu s'annonce pendant trois jours au plus : un cron manqué se rattrape, un vieux comptage ne ressort pas. */
const JOURS_DE_L_ANNONCE = 3;
/** Une borne par passage. */
const BORNE_DES_MESSAGES = 40;

const RANGS = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième', 'onzième', 'douzième'];
const rangEnLettres = (n: number): string => RANGS[n - 1] ?? `${n}e`;

/** Un calibre de la Maison (`mnd_model_bands`). */
type Calibre = { id: string; name?: string; maxLocks: number | null };
/** « Micro, de 251 à 350 locks » : le calibre et sa fourchette, jamais le
    compte de la tête (même règle que `fourchetteDite`, src/shared/pricing.ts). */
const calibreEtFourchette = (id: string | undefined, calibres: readonly Calibre[]): string | null => {
  const b = calibres.find((x) => x.id === id);
  if (!b?.name) return null;
  const tries = [...calibres].sort((x, y) => (x.maxLocks ?? Infinity) - (y.maxLocks ?? Infinity));
  const i = tries.findIndex((x) => x.id === b.id);
  const dessous = i > 0 ? tries[i - 1].maxLocks : null;
  const min = dessous == null ? null : dessous + 1;
  const max = b.maxLocks ?? null;
  const n = (v: number) => v.toLocaleString('fr-FR');
  const fourchette = min === null ? (max === null ? '' : `jusqu’à ${n(max)} locks`) : max === null ? `plus de ${n(min - 1)} locks` : `de ${n(min)} à ${n(max)} locks`;
  return fourchette ? `${b.name}, ${fourchette}` : b.name;
};

/** Le prénom de la tête, quand on écrit à celle qui paie pour elle. */
const prenomDe = (fiche: { name?: unknown } | undefined, repli?: string): string =>
  prenomDUsage(fiche, repli);

/** LES CINQ VARIABLES DU MODÈLE `rappel_echeance_veille` : son appel, le jour
    dû avec l'année, ce qui arrive, la formule (et pour qui), le montant. */
const variablesDuRappel = (o: { appel: string; dueIso: string; genre: 'echeance' | 'lune'; numero?: number; formule: string; pourQui?: string; montantXof: number }): string[] => [
  o.appel,
  jourDitAvecLAnnee(o.dueIso),
  o.genre === 'lune' ? 'la prochaine lune' : `la ${rangEnLettres(o.numero ?? 1)} échéance`,
  o.pourQui ? `${o.formule}, pour ${o.pourQui}` : o.formule,
  francs(o.montantXof),
];
/** Ce qu'elle lit, tel que le fil du Trône le garde : le texte du modèle, variables posées. */
const texteDuRappel = (v: readonly string[]): string =>
  `Bonjour ${v[0]},\nDemain, ${v[1]}, arrive ${v[2]} de votre formule ${v[3]} : ${v[4]}.\nVous pouvez la régler dès maintenant, en ligne, ou au comptoir de la Maison.`;

/** CE QUE LE PRIX REVU FAIT À SES ÉCHÉANCES, en une phrase (décision 10) :
    l'écart s'ajoute à la prochaine échéance, ou devient une échéance neuve à
    30 jours ; en sa faveur, il se retranche de ce qui reste, et le versé
    au-delà devient un avoir. Lu sur l'échéancier déjà réécrit par le Trône. */
function effetDuPrixRevu(sub: ContratEcrit, plan: FormuleEcrite | undefined, pieces: readonly PieceEcrite[], jour: string): string | null {
  const pr = sub.prixRevu;
  if (!pr) return null;
  const ecart = Math.round(pr.nouveauXof - pr.ancienXof);
  if (!ecart) return null;
  if (!estUnPaquet(plan)) {
    return estIso(sub.nextIso)
      ? `Le nouveau prix vaut dès votre prochaine lune, le ${jourDitAvecLAnnee(jourOuvre(sub.nextIso))}.`
      : 'Le nouveau prix vaut dès votre prochaine lune.';
  }
  const regle = versementsDuContrat(sub, pieces).reduce((s, v) => s + v.montantXof, 0);
  const { etat } = etatPourLArgent(sub, plan, jour, regle);
  const argent = argentDuContrat(sub, plan, pieces, jour, { prixXof: pr.nouveauXof, etat });
  const ouvertes = argent.echeances.filter((e) => e.resteXof > 0 && e.statut !== 'annulee');
  if (ecart > 0) {
    const derniere = argent.echeances[argent.echeances.length - 1];
    if (derniere && derniere.resteXof > 0 && derniere.amountXof === ecart && derniere.dueEcriteIso === jourOuvre(decaleLeJour(pr.le, 30))) {
      return `L’écart, ${francs(ecart)}, devient une nouvelle échéance, le ${jourDitAvecLAnnee(derniere.dueIso)}.`;
    }
    const portee = ouvertes[0];
    if (portee && portee.amountXof > ecart) {
      return `L’écart, ${francs(ecart)}, s’ajoute à votre prochaine échéance, le ${jourDitAvecLAnnee(portee.dueIso)} : elle passe de ${francs(portee.amountXof - ecart)} à ${francs(portee.amountXof)}.`;
    }
    return `L’écart, ${francs(ecart)}, s’ajoute à ce qu’il vous reste à régler.`;
  }
  const gain = -ecart;
  if (argent.avoirXof > 0) {
    return argent.avoirXof >= gain
      ? `En votre faveur, l’écart, ${francs(gain)}, devient un avoir dans Ma Couronne.`
      : `En votre faveur, l’écart, ${francs(gain)}, efface ce qu’il vous restait à régler, et ${francs(argent.avoirXof)} deviennent un avoir dans Ma Couronne.`;
  }
  const portee = ouvertes[0];
  return portee
    ? `En votre faveur, l’écart, ${francs(gain)}, se retranche de ce qu’il vous reste à régler : votre prochaine échéance, le ${jourDitAvecLAnnee(portee.dueIso)}, est désormais de ${francs(portee.amountXof)}.`
    : `En votre faveur, l’écart, ${francs(gain)}, se retranche de votre prix.`;
}

/** LES SEPT VARIABLES DU MODÈLE `prix_revu_apres_comptage` : son appel, le
    jour du comptage avec l'année, ce qui a été compté, la formule, l'ancien
    prix, le nouveau, l'effet sur ses échéances. */
const variablesDuPrixRevu = (o: { appel: string; le: string; calibre: string | null; formule: string; pourQui?: string; ancienXof: number; nouveauXof: number; effet: string }): string[] => [
  o.appel,
  jourDitAvecLAnnee(o.le),
  `${o.pourQui ? `le calibre de ${o.pourQui}` : 'votre calibre'}${o.calibre ? ` : ${o.calibre}` : ''}`,
  o.pourQui ? `la formule de ${o.pourQui}, ${o.formule}` : `votre ${o.formule}`,
  francs(o.ancienXof),
  francs(o.nouveauXof),
  o.effet,
];
const texteDuPrixRevu = (v: readonly string[]): string =>
  `Bonjour ${v[0]},\nLe ${v[1]}, la Maison a compté ${v[2]}.\nLe prix de ${v[3]} passe de ${v[4]} à ${v[5]}. ${v[6]}\nRien d’autre ne change. Le détail vous attend dans Ma Couronne.`;
// ── FIN phrases

// ── DEBUT juge (qui reçoit quoi aujourd'hui ; pur, éprouvé par le banc)

/** Une échéance ou une lune qui tombe DEMAIN : un rappel. */
type RappelDu = { genre: 'echeance' | 'lune'; numero?: number; dueIso: string; montantXof: number };
/** LES RAPPELS D'UN CONTRAT POUR AUJOURD'HUI. `payeParLienXof` : les liens MND
    PAY payés que personne n'a encore inscrits ; ils soldent d'abord l'échu. */
function rappelsDuContrat(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, pieces: readonly PieceEcrite[], aujourdhui: string, payeParLienXof = 0,
): RappelDu[] {
  const regle = versementsDuContrat(sub, pieces).reduce((s, v) => s + v.montantXof, 0);
  const { etat } = etatPourLArgent(sub, plan, aujourdhui, regle);
  if (etat === 'resiliee' || etat === 'effacee' || etat === 'retenue') return [];
  const demain = decaleLeJour(aujourdhui, 1);
  const argent = argentDuContrat(sub, plan, pieces, aujourdhui, { etat });
  let credit = Math.max(0, payeParLienXof - argent.aRegleAujourdhuiXof);
  const fin = finDuContratLu(sub);
  const out: RappelDu[] = [];
  for (const x of argent.aVenir) {
    if (x.dueIso !== demain) continue;
    if (x.genre === 'lune') {
      if (fin && x.dueIso > fin) continue;
      if (sub.suspendue && sub.suspendue.du <= demain && demain <= sub.suspendue.au) continue;
      out.push({ genre: 'lune', dueIso: x.dueIso, montantXof: x.montantXof });
      continue;
    }
    const pris = Math.min(credit, x.montantXof);
    credit -= pris;
    if (x.montantXof - pris > 0) out.push({ genre: 'echeance', numero: x.numero, dueIso: x.dueIso, montantXof: x.montantXof - pris });
  }
  return out;
}

/** L'annonce d'un prix revu est-elle à faire aujourd'hui ? Dans les trois
    jours du comptage, sur un contrat qui court, et pour un vrai écart. */
function annonceDuPrixRevu(sub: ContratEcrit, plan: FormuleEcrite | undefined, pieces: readonly PieceEcrite[], aujourdhui: string): boolean {
  const pr = sub.prixRevu;
  if (!pr || !estIso(pr.le) || pr.le > aujourdhui || joursEntre(pr.le, aujourdhui) > JOURS_DE_L_ANNONCE) return false;
  if (Math.round(pr.nouveauXof - pr.ancienXof) === 0) return false;
  const regle = versementsDuContrat(sub, pieces).reduce((s, v) => s + v.montantXof, 0);
  const { etat } = etatPourLArgent(sub, plan, aujourdhui, regle);
  return etat !== 'resiliee' && etat !== 'effacee';
}

/** Les identifiants au journal des envois : un rappel par échéance, une annonce par prix revu. */
const idDuRappel = (subId: string, r: RappelDu): string =>
  `rv-${subId}-${r.genre === 'lune' ? 'lune' : `e${r.numero}`}-${r.dueIso}-whatsapp`;
const idDeLAnnonce = (subId: string, pr: { le: string; nouveauXof: number }): string =>
  `pr-${subId}-${pr.le}-${Math.round(pr.nouveauXof)}-whatsapp`;

/** À QUI ÉCRIRE : la tête si elle a un numéro, sinon celle qui paie pour son foyer. */
type FicheLue = { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean; archived?: boolean; familyId?: string };
function destinataireDe(
  ids: readonly (string | undefined)[], fiches: ReadonlyMap<string, FicheLue>, payeurDuFoyer: ReadonlyMap<string, string>,
): FicheLue | undefined {
  const connues = ids.filter((x): x is string => !!x).map((id) => fiches.get(id)).filter((x): x is FicheLue => !!x);
  const avecNumero = connues.find((f) => !!numeroIntl(f.phone));
  if (avecNumero) return avecNumero;
  for (const f of connues) {
    const payeur = f.familyId ? fiches.get(payeurDuFoyer.get(f.familyId) ?? '') : undefined;
    if (payeur && numeroIntl(payeur.phone)) return payeur;
  }
  return connues[connues.length - 1];
}
// ── FIN juge
/* ══ ARRÊTÉ D'AVANCE, MODÈLE EN PAUSE — 5 novembre 2026 (ce qui va partir) ══
   « Ne pas envoyer » (la direction, depuis l'onglet « À venir ») et
   l'interrupteur « En service / En pause » d'un modèle. Recopié À
   L'IDENTIQUE de `src/shared/arret-d-avance-pur.ts` ; le banc des douze
   lunes (R8) compare la copie. NE RIEN RETOUCHER ENTRE LES REPÈRES. ══ */
/* ⟨arret-d-avance⟩ */
/** Un message arrêté d'avance : sa clé, qui l'a arrêté et quand ; « Remettre » pose `remisLe`. */
type ArretDAvance = { id?: string; cle?: string; arreteLe?: string; arretePar?: string; remisLe?: string; remisPar?: string; [k: string]: unknown };
/** Un modèle Meta en pause chez nous : `enPause` vrai, qui, quand, pourquoi ; « Reprendre » le remet à faux. */
type PauseDuModele = { id?: string; modele?: string; enPause?: boolean; par?: string; le?: string; motif?: string; parOpale?: boolean; [k: string]: unknown };
/** Ce que la porte d'avance décide d'une ligne. `repli` : le modèle est en pause, son repli part à sa place. */
type VerdictDAvance =
  | { verdict: 'arrete'; cle: string; par: string; le: string; motif: string }
  | { verdict: 'en-pause'; modele: string; motif: string }
  | { verdict: 'repli'; modele: string; motif: string };
/** Ce qu'une ligne d'envoi porte et que la clé lit. */
type LigneDAvance = {
  id?: unknown; type?: unknown; genre?: unknown; apptId?: unknown; seanceId?: unknown; invoiceId?: unknown; rang?: unknown;
  clientId?: unknown; teteId?: unknown; subId?: unknown; campagneId?: unknown; dateRdv?: unknown; anniversaire?: unknown;
  colis?: { genre?: unknown; modele?: unknown; repli?: { modele?: unknown } | null } | null;
  [k: string]: unknown;
};

/** Le mot qui ouvre le détail d'une ligne arrêtée d'avance : le Trône le lit. */
const MARQUE_DE_L_ARRET = 'arrêté d’avance';
/** Opale signale un modèle au deuxième « non remis » de suite, le met en pause au cinquième. */
const NON_REMIS_SIGNALE_AU = 2;
const NON_REMIS_EN_PAUSE_AU = 5;

const motDAvance = (v: unknown): string => String(v ?? '').trim();

/** LA CLÉ D'UN MESSAGE : la même pour la prévision, la ligne en salle et la
    ligne prise par le facteur. Une ligne que rien ne décrit n'est qu'elle-même. */
function cleDuMessage(l: LigneDAvance | null | undefined): string {
  const type = motDAvance(l?.type);
  const id = motDAvance(l?.id);
  const rdv = motDAvance(l?.apptId);
  if ((type === 'rappel-j1' || type === 'confirmation' || type === 'reprise-j3') && rdv) return `${type}:${rdv}`;
  if (type === 'point-apres' || type === 'point-avant') {
    const seance = motDAvance(l?.seanceId) || rdv;
    if (seance) return `${type}:${seance}`;
  }
  if (type === 'relance-facture') {
    const m = /^rl-(.+)-(\d+)-whatsapp$/.exec(id);
    if (m) return `relance:${m[1]}:${m[2]}`;
    if (motDAvance(l?.invoiceId) && motDAvance(l?.rang)) return `relance:${motDAvance(l?.invoiceId)}:${motDAvance(l?.rang)}`;
  }
  if (type === 'rappel-echeance' || type === 'prix-revu') {
    const m = /^(?:rv|pr)-(.+)-whatsapp$/.exec(id);
    if (m) return `${type === 'prix-revu' ? 'prix-revu' : 'echeance'}:${m[1]}`;
  }
  if (type === 'fete-de-couronne') {
    const m = /^fc-(.+)-(\d{4})-whatsapp$/.exec(id);
    if (m) return `fete:${m[1]}:${m[2]}`;
  }
  if (type === 'avis-google' && motDAvance(l?.invoiceId)) return `avis:${motDAvance(l?.invoiceId)}`;
  if (type === 'papier-de-la-piece' && motDAvance(l?.invoiceId)) return `papier:${motDAvance(l?.invoiceId)}`;
  if (type === 'campagne' && motDAvance(l?.campagneId)) return `campagne:${motDAvance(l?.campagneId)}:${motDAvance(l?.clientId)}`;
  if (type === 'gerard') {
    const genre = motDAvance(l?.genre);
    const jour = /^gerard-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1] ?? '';
    if (genre === 'garder' && rdv) return `garder:${rdv}`;
    if (genre === 'anniversaire' && motDAvance(l?.clientId) && jour) return `anniv:${motDAvance(l?.clientId)}:${jour.slice(0, 4)}`;
    if (genre && motDAvance(l?.clientId) && jour) return `perle:${genre}:${motDAvance(l?.clientId)}:${jour}`;
  }
  return `ligne:${id}`;
}

/** L'ARRÊT EN VIGUEUR pour cette clé, ou null. Remis après le dernier arrêt : plus d'arrêt. */
function arretEnVigueur(cle: string, arrets: readonly (ArretDAvance | null | undefined)[] | null | undefined): ArretDAvance | null {
  if (!cle) return null;
  for (const a of arrets ?? []) {
    if (!a || motDAvance(a.cle ?? a.id) !== cle || !motDAvance(a.arreteLe)) continue;
    if (motDAvance(a.remisLe) && motDAvance(a.remisLe) >= motDAvance(a.arreteLe)) continue;
    return a;
  }
  return null;
}

/** LE MODÈLE EST-IL EN PAUSE ? La pause en vigueur, ou null. */
function modeleEnPause(modele: unknown, pauses: readonly (PauseDuModele | null | undefined)[] | null | undefined): PauseDuModele | null {
  const m = motDAvance(modele);
  if (!m) return null;
  for (const p of pauses ?? []) if (p && motDAvance(p.modele ?? p.id) === m && p.enPause === true) return p;
  return null;
}

/** « mercredi 4 novembre 2026 à 21 h 40 », à l'heure de Cotonou (UTC + 1, sans heure d'été). */
function momentDAvance(iso: unknown): string {
  const t = Date.parse(motDAvance(iso));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = d.getUTCDate();
  const mi = d.getUTCMinutes();
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${d.getUTCHours()} h${mi ? ` ${String(mi).padStart(2, '0')}` : ''}`;
}

/** LA PORTE D'AVANCE : l'arrêt de la direction d'abord, quel que soit le
    canal (le SMS d'un rappel arrêté ne part pas non plus) ; puis, pour un
    modèle WhatsApp, la pause : son repli part s'il en a un qui n'est pas en
    pause, sinon rien. `null` : rien ne l'arrête ici. */
function laPorteDAvance(
  l: LigneDAvance | null | undefined,
  o: { arrets?: readonly (ArretDAvance | null | undefined)[] | null; pauses?: readonly (PauseDuModele | null | undefined)[] | null },
): VerdictDAvance | null {
  const cle = cleDuMessage(l);
  const arret = arretEnVigueur(cle, o.arrets);
  if (arret) {
    const par = motDAvance(arret.arretePar) || 'la direction';
    const le = motDAvance(arret.arreteLe);
    const quand = momentDAvance(le);
    return { verdict: 'arrete', cle, par, le, motif: `${MARQUE_DE_L_ARRET} par ${par}${quand ? `, ${quand}` : ''}` };
  }
  if (motDAvance(l?.colis?.genre) !== 'whatsapp') return null;
  const modele = motDAvance(l?.colis?.modele);
  const pause = modeleEnPause(modele, o.pauses);
  if (!pause) return null;
  const repli = motDAvance(l?.colis?.repli?.modele);
  if (repli && repli !== modele && !modeleEnPause(repli, o.pauses)) {
    return { verdict: 'repli', modele: repli, motif: `le modèle ${modele} est en pause : ${repli} part à sa place` };
  }
  const par = motDAvance(pause.par);
  return { verdict: 'en-pause', modele, motif: `le modèle ${modele} est en pause${par ? ` (${par === 'Opale' ? 'mis en pause par Opale' : `par ${par}`})` : ''}` };
}

/** CE QUE LA LIGNE DEVIENT quand elle ne part pas. Arrêtée : « écarté », par
    qui l'a arrêtée ; le colis reste, « Remettre » peut la rendre tant que
    son heure n'est pas passée. En pause : « périmé », marqué par Opale (les
    fonctions ne la redéposent pas). Un repli n'écrit rien : la ligne part. */
function ligneRetenueDAvance(v: VerdictDAvance, maintenantIso: string): Record<string, unknown> | null {
  if (v.verdict === 'arrete') {
    return { statut: 'écarté', ecartePar: v.par, ecarteLe: maintenantIso, detail: v.motif, arretDAvance: { cle: v.cle, par: v.par, le: v.le } };
  }
  if (v.verdict === 'en-pause') return { statut: 'périmé', detail: `retenu par Opale : ${v.motif}`, modeleEnPause: v.modele };
  return null;
}

/** LA SÉRIE DES « NON REMIS » d'un modèle : du plus récent au plus ancien, les
    messages sortants que WhatsApp a jugés, comptés tant qu'ils sont « non
    remis ». Un message encore en route ne compte ni pour ni contre. */
function serieDeNonRemis(messages: readonly ({ sens?: unknown; etat?: unknown; quand?: unknown } | null | undefined)[]): number {
  const juges = messages
    .filter((m): m is { sens?: unknown; etat?: unknown; quand?: unknown } => !!m && motDAvance(m.sens) === 'sortant'
      && ['non-remis', 'remis', 'lu'].includes(motDAvance(m.etat)) && Number.isFinite(Date.parse(motDAvance(m.quand))))
    .sort((a, b) => Date.parse(motDAvance(b.quand)) - Date.parse(motDAvance(a.quand)));
  let n = 0;
  for (const m of juges) {
    if (motDAvance(m.etat) !== 'non-remis') break;
    n += 1;
  }
  return n;
}

/** CE QU'OPALE FAIT D'UNE SÉRIE : rien, le signaler, ou mettre le modèle en pause. */
function veilleDuModele(serie: number): 'rien' | 'signale' | 'pause' {
  if (serie >= NON_REMIS_EN_PAUSE_AU) return 'pause';
  if (serie >= NON_REMIS_SIGNALE_AU) return 'signale';
  return 'rien';
}

/** Ce qu'une fonction donne pour lire : la base, telle que le client Supabase la présente. */
type BaseDAvance = { from(t: string): { select(c: string): { range(de: number, a: number): PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
/** LA LECTURE AU DÉPÔT : une fonction qui dépose lit les arrêts et les pauses
    une fois par passage. Une lecture qui échoue n'arrête rien ici : le
    facteur, lui, ne laisse rien partir sans les avoir lus. */
async function litLesArretsEtLesPauses(sb: BaseDAvance): Promise<{ arrets: ArretDAvance[]; pauses: PauseDuModele[] }> {
  const lis = async (t: string): Promise<Record<string, unknown>[]> => {
    try {
      const { data, error } = await sb.from(t).select('id, data').range(0, 4999);
      if (error) return [];
      return ((data ?? []) as { id?: unknown; data?: Record<string, unknown> | null }[]).map((r) => ({ ...(r?.data ?? {}), id: String(r?.id ?? '') }));
    } catch {
      return [];
    }
  };
  const [arrets, pauses] = await Promise.all([lis('envois_arretes'), lis('modeles_en_pause')]);
  return { arrets: arrets as ArretDAvance[], pauses: pauses as PauseDuModele[] };
}
/* ⟨/arret-d-avance⟩ */


/** Les verdicts du journal qui ne comptent pas comme un message parti. */
const SE_RETENTE = new Set(['échec', 'périmé']);

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

/** LA TOURNÉE : lit, juge, dépose. `sb` est le client service ; le banc lui
    passe une base simulée, et un faux `envoie`. */
// deno-lint-ignore no-explicit-any
async function tournee(sb: any, o: { maintenantMs: number; MODELE_RAPPEL: string; MODELE_PRIX_REVU: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: typeof fetch }): Promise<Record<string, unknown>> {
  const { maintenantMs, MODELE_RAPPEL, MODELE_PRIX_REVU, WA_TOKEN, WA_PHONE_ID } = o;
  const envoie = o.envoie ?? fetch;
  const aujourdhui = new Date(maintenantMs).toLocaleDateString('en-CA', { timeZone: TZ });
  const heure = heureDuSalon(maintenantMs);
  const rappelsOuverts = !!MODELE_RAPPEL && heure >= HEURE_DU_RAPPEL;
  const annoncesOuvertes = !!MODELE_PRIX_REVU;
  if (!rappelsOuverts && !annoncesOuvertes) return { version: VERSION, jour: aujourdhui, messages: 'pas-encore' };

  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_auto_config', 'mnd_facteur', 'mnd_model_bands']);
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, maintenantMs);
  if (!salleOuverte && (!WA_TOKEN || !WA_PHONE_ID)) return { version: VERSION, messages: 'sans-facteur' };
  /* Ce qui va partir (5 novembre 2026) : les rappels arrêtés d'avance et les modèles en pause. */
  const avanceDuDepot = await litLesArretsEtLesPauses(sb);
  const calibres = (Array.isArray(docs?.find((d) => d.key === 'mnd_model_bands')?.data) ? docs?.find((d) => d.key === 'mnd_model_bands')?.data : []) as Calibre[];

  /* ① LES CONTRATS, par pages (une lecture plafonne à mille lignes), et leurs formules. */
  const contrats: ContratEcrit[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('subscribers').select('id, data').range(de, de + 999);
    if (error) return { version: VERSION, messages: 'lecture-refusee', motif: error.message.slice(0, 120) };
    contrats.push(...(data ?? []).map((l) => ({ ...(l.data as ContratEcrit), id: l.id as string })));
    if ((data ?? []).length < 1000) break;
  }
  const { data: lignesDesFormules } = await sb.from('plans').select('id, data');
  const formules = ((lignesDesFormules ?? []) as { id: string; data: FormuleEcrite }[]).map((l) => ({ ...l.data, id: l.id }));
  const formuleDe = (c: ContratEcrit) => formules.find((p) => p.id === c.planId);

  /* Leurs pièces : le versé est l'union du contrat et de sa pièce. */
  const idsPieces = [...new Set(contrats.map((c) => c.invoiceId).filter((x): x is string => !!x))];
  const pieces: PieceEcrite[] = [];
  for (let i = 0; i < idsPieces.length; i += 200) {
    const { data } = await sb.from('invoices').select('id, data').in('id', idsPieces.slice(i, i + 200));
    pieces.push(...(data ?? []).map((l) => ({ ...(l.data as PieceEcrite), id: l.id as string })));
  }
  /* Les liens MND PAY payés que personne n'a encore inscrits (aucun Trône ouvert). */
  const payeParPiece = new Map<string, number>();
  if (idsPieces.length) {
    const { data: payees } = await sb.from('mnd_pay').select('id, data').in('data->>pieceId', idsPieces).eq('data->>statut', 'payee');
    for (const l of (payees ?? []) as { id: string; data: { pieceId?: string; genre?: string; montantXof?: number } }[]) {
      const p = pieces.find((x) => x.id === l.data?.pieceId);
      if (!p || l.data?.genre !== 'lien' || (p.payments ?? []).some((v) => v.id === l.id)) continue;
      payeParPiece.set(p.id, (payeParPiece.get(p.id) ?? 0) + Math.round(Number(l.data?.montantXof) || 0));
    }
  }

  /* ② ③ ④ CE QUI EST DÛ AUJOURD'HUI. */
  type AEcrire = { id: string; type: 'rappel-echeance' | 'prix-revu'; sub: ContratEcrit; rappel?: RappelDu };
  const aEcrire: AEcrire[] = [];
  for (const c of contrats) {
    const plan = formuleDe(c);
    if (rappelsOuverts) {
      for (const r of rappelsDuContrat(c, plan, pieces, aujourdhui, c.invoiceId ? payeParPiece.get(c.invoiceId) ?? 0 : 0)) {
        aEcrire.push({ id: idDuRappel(c.id, r), type: 'rappel-echeance', sub: c, rappel: r });
      }
    }
    if (annoncesOuvertes && c.prixRevu && annonceDuPrixRevu(c, plan, pieces, aujourdhui)) {
      aEcrire.push({ id: idDeLAnnonce(c.id, c.prixRevu), type: 'prix-revu', sub: c });
    }
  }
  if (aEcrire.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, contrats: contrats.length };

  /* Le journal : un message déjà posé ne se repose pas ; seul un échec se retente. */
  const deja = new Set<string>();
  for (let i = 0; i < aEcrire.length; i += 200) {
    const { data } = await sb.from('envois').select('id, data').in('id', aEcrire.slice(i, i + 200).map((m) => m.id));
    for (const l of (data ?? []) as { id: string; data: { statut?: string } }[]) {
      if (!SE_RETENTE.has(l.data?.statut ?? '')) deja.add(l.id);
    }
  }
  const restent = aEcrire.filter((m) => !deja.has(m.id));
  if (restent.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, deja: deja.size };

  /* Les fiches : la tête, et celle qui paie pour son foyer. */
  const fiches = new Map<string, FicheLue>();
  const litLesFiches = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('clients').select('id, data').in('id', ids.slice(i, i + 200));
      for (const l of data ?? []) fiches.set(l.id as string, { id: l.id as string, ...(l.data as object) });
    }
  };
  await litLesFiches([...new Set(restent.map((m) => m.sub.clientId).filter((x): x is string => !!x))]);
  const foyers = [...new Set([...fiches.values()].filter((x) => !numeroIntl(x.phone) && x.familyId).map((x) => x.familyId as string))];
  const payeurDuFoyer = new Map<string, string>();
  if (foyers.length) {
    const { data: lignesDesFoyers } = await sb.from('families').select('id, data').in('id', foyers);
    for (const l of (lignesDesFoyers ?? []) as { id: string; data: { payerClientId?: string } }[]) {
      if (l.data?.payerClientId) payeurDuFoyer.set(l.id, l.data.payerClientId);
    }
    await litLesFiches([...payeurDuFoyer.values()].filter((id) => !fiches.has(id)));
  }

  let parties = 0;
  let bornee = false;
  const sautes: Record<string, number> = {};
  const saute = (pourquoi: string) => { sautes[pourquoi] = (sautes[pourquoi] ?? 0) + 1; };

  for (const m of restent) {
    if (parties >= BORNE_DES_MESSAGES) { bornee = true; break; }
    const c = m.sub;
    const plan = formuleDe(c);
    const tete = c.clientId ? fiches.get(c.clientId) : undefined;
    const fiche = destinataireDe([c.clientId], fiches, payeurDuFoyer);
    const tel = numeroIntl(fiche?.phone);
    if (!fiche || !tel) { saute('sans-numero'); continue; }
    if (fiche.archived) { saute('archivee'); continue; }
    const pourQui = fiche.id !== c.clientId ? prenomDe(tete, c.name) || undefined : undefined;
    const appel = appelDe(fiche, fiche.id === c.clientId ? c.name : undefined);
    const formule = plan?.name ?? 'formule';

    let modele: string;
    let variables: string[];
    let texteAuFil: string;
    if (m.type === 'rappel-echeance' && m.rappel) {
      modele = MODELE_RAPPEL;
      variables = variablesDuRappel({ appel, dueIso: m.rappel.dueIso, genre: m.rappel.genre, numero: m.rappel.numero, formule, pourQui, montantXof: m.rappel.montantXof });
      texteAuFil = texteDuRappel(variables);
    } else {
      const pr = c.prixRevu!;
      const effet = effetDuPrixRevu(c, plan, pieces, aujourdhui);
      if (!effet) { saute('sans-ecart'); continue; }
      modele = MODELE_PRIX_REVU;
      variables = variablesDuPrixRevu({ appel, le: pr.le, calibre: calibreEtFourchette(pr.calibre ?? c.calibreVendu, calibres), formule, pourQui, ancienXof: pr.ancienXof, nouveauXof: pr.nouveauXof, effet });
      texteAuFil = texteDuPrixRevu(variables);
    }
    const composants = [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }];
    const maintenant = new Date(maintenantMs).toISOString();
    const commun = {
      id: m.id, branchId: c.branchId, type: m.type, canal: 'whatsapp', apptId: '', dateRdv: '', subId: c.id,
      clientId: fiche.id, numero: tel, quand: maintenant,
      ...(m.rappel ? { dueIso: m.rappel.dueIso, ...(m.rappel.numero ? { echeance: m.rappel.numero } : {}), montantXof: m.rappel.montantXof } : {}),
      ...(m.type === 'prix-revu' && c.prixRevu ? { revuLe: c.prixRevu.le } : {}),
    };
    /* ARRÊTÉ D'AVANCE, OU SON MODÈLE EN PAUSE (5 novembre 2026, ce qui va
       partir) : la ligne s'écrit telle qu'elle partirait, mais « écarté »
       (par qui l'a arrêtée) ou « périmé » (retenue par Opale). */
    const aDeposer = {
      ...commun, statut: 'en-attente',
      ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele, parQui: 'la Maison, automatiquement', texteAuFil, composants }, appel),
    };
    const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);
    if (dAvance && dAvance.verdict !== 'repli') {
      await sb.from('envois').upsert({ id: m.id, branch_id: c.branchId ?? null, data: { ...aDeposer, ...ligneRetenueDAvance(dAvance, maintenant) } }, { onConflict: 'id' });
      saute(dAvance.verdict === 'arrete' ? 'arrete-d-avance' : 'modele-en-pause');
      continue;
    }
    if (salleOuverte) {
      await sb.from('envois').upsert({
        id: m.id, branch_id: c.branchId ?? null,
        data: {
          ...commun, statut: 'en-attente',
          ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele, parQui: 'la Maison, automatiquement', texteAuFil, composants }, appel),
        },
      }, { onConflict: 'id' });
      parties++;
      continue;
    }
    /* Le facteur se tait : on envoie comme les rappels, hors des heures calmes seulement. */
    if (dansLesHeuresCalmes(maintenantMs, regles)) { saute('heures-calmes'); continue; }
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    try {
      const rep = await envoie(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: modele, language: { code: 'fr' }, components: composants } }),
        signal: AbortSignal.timeout(10_000),
      });
      const corps = await rep.json().catch(() => ({}));
      waId = String(corps?.messages?.[0]?.id ?? '');
      if (rep.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
      else detail = String(corps?.error?.message ?? `HTTP ${rep.status}`);
    } catch (e) {
      detail = String(e);
    }
    await sb.from('envois').upsert({
      id: m.id, branch_id: c.branchId ?? null,
      data: { ...commun, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(waId ? { waMessageId: waId } : {}) },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') { saute('refus-meta'); continue; }
    parties++;
    if (waId) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil, branch_id: c.branchId ?? null,
        data: {
          id: idFil, waId, branchId: c.branchId, sens: 'sortant', numero: tel, clientId: fiche.id, texte: texteAuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }

  return {
    version: VERSION, jour: aujourdhui, messages: parties, aEcrire: restent.length, salle: salleOuverte, sautes,
    ...(bornee ? { borne: BORNE_DES_MESSAGES } : {}),
  };
}
// ── FIN tournee

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const MODELE_RAPPEL = (Deno.env.get('WA_TEMPLATE_RAPPEL_ECHEANCE') ?? '').trim();
  const MODELE_PRIX_REVU = (Deno.env.get('WA_TEMPLATE_PRIX_REVU') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN') ?? '';
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') ?? '';

  /* ⓪ LE CONTRÔLE DE SANTÉ — ouvrir l'adresse dans un navigateur ne lance
     RIEN : on dit la version et ce qui est posé, en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'rappels-d-echeance', version: VERSION,
      secrets: {
        WA_TEMPLATE_RAPPEL_ECHEANCE: MODELE_RAPPEL.length, WA_TEMPLATE_PRIX_REVU: MODELE_PRIX_REVU.length,
        CLE_SERVICE: service.length, WA_TOKEN: WA_TOKEN.length, WA_PHONE_ID: WA_PHONE_ID.length,
      },
    });
  }

  /* Seul le cron (armé de la clé service) réveille la tournée. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return json({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }, 401);
  }
  if (!MODELE_RAPPEL && !MODELE_PRIX_REVU) return json({ version: VERSION, messages: 'sans-modele' });

  const sb = createClient(urlBase, service);
  try {
    const r = await tournee(sb, { maintenantMs: Date.now(), MODELE_RAPPEL, MODELE_PRIX_REVU, WA_TOKEN, WA_PHONE_ID });
    return json(r, r.messages === 'lecture-refusee' ? 500 : 200);
  } catch (e) {
    return json({ version: VERSION, messages: 'echec', motif: String(e).slice(0, 200) }, 500);
  }
});
