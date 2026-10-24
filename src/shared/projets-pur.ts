/* ═══════════════════════════════════════════════════════════════════
   LES PROJETS DE LA MAISON — 24 octobre 2026.

   « Ajouter la Gestion des projets : planification, affectation des
   ressources, et suivi des tâches. Faire une interface intuitive : navigation
   simple et moderne facilitant l'adoption par les équipes » (Yéman), maquette
   VJ5PJEGUPDbYKUgEdMUNbS (vues 5 à 7), « construis » le 24 octobre.

   LA RÈGLE QUI PORTE TOUT : UNE TÂCHE EST UNE DEMANDE DU FIL. Le Tableau de
   l'équipe l'a posée le 18 août, « un tableau qui garderait ses propres tâches
   serait un second endroit où demander ». Un projet ne garde donc AUCUNE
   tâche : il porte un nom, un pilote, des dates et des jalons, et les
   demandes du Fil le désignent par `projetId`. Cocher une tâche ici, c'est
   cocher la demande dans le Fil et sur le Tableau : un seul registre.

   LES CHOIX AU SÉLECTEUR (24 octobre 2026, soir) :
     · rangé sous Direction, aucun département nouveau ;
     · seuls les souverains (Yéman, Brice) ouvrent un projet et nomment le
       pilote, qui ajoute ensuite les tâches et les confie ;
     · la charge se compte en NOMBRE DE TÂCHES, sans heures. Les séances de
       l'Agenda sont rappelées pour mémoire, jamais additionnées : le Trône
       ne dit pas qui « déborde », il montre qui porte plus que les autres ;
     · la Liste s'ouvre en premier.

   « EN COURS » N'EST PAS UN ÉTAT QU'ON COCHE. Le Tableau l'a écarté le
   18 août : « un état qu'il faut penser à changer à la main finit toujours
   par mentir ». Les colonnes se CALCULENT depuis l'échéance : en retard,
   dans les 7 jours, plus tard, sans date, fait.

   DES FENÊTRES DE SEPT JOURS, PAS DES SEMAINES DU CALENDRIER. Un samedi,
   « cette semaine » ne garde qu'un dimanche fermé : la colonne était vide et
   la charge disait « 0 tâche » à la veille d'une semaine pleine. Chaque
   fenêtre part d'aujourd'hui (ou d'une date donnée) et dure sept jours.

   Ce module est PUR : aucune lecture du réseau, aucun magasin. Le banc
   `scripts/verifie-les-projets.mjs` le prouve sans navigateur. */

export type JalonDuProjet = { id: string; nom: string; date: string };

export type StatutDuProjet = 'actif' | 'attente' | 'clos';

export type Projet = {
  id: string;
  branchId: string;
  nom: string;
  /** Le libellé d'un département de la barre (« Vente & Caisse »…). */
  departement: string;
  /** Le pilote : l'adresse du compte fait foi, le nom reste lisible. */
  piloteMail: string;
  piloteNom: string;
  debut: string;
  fin: string;
  jalons: JalonDuProjet[];
  /** « attente » = le projet attend le oui de la direction ; rien n'y avance
      avant. « clos » = rangé, il sort des vues sans rien effacer. */
  statut: StatutDuProjet;
  note?: string;
  creeAt: string;
  creePar: string;
};

/** Ce qu'un projet lit d'une demande du Fil. `close` est calculé par
    l'appelant (`demandeOuverte`, qui connaît les factures) : ce module ne
    sait rien des pièces. */
export type TacheDuProjet = {
  id: string;
  texte: string;
  projetId?: string;
  jalonId?: string;
  demandePour?: string;
  demandePourNom?: string;
  echeance?: string;
  faitAt?: string;
  auteurNom?: string;
  at?: string;
  close: boolean;
};

export type EtatDuProjet = 'heure' | 'retard' | 'oui' | 'clos';

export const NOMS_DES_ETATS: Record<EtatDuProjet, string> = {
  heure: 'À l’heure',
  retard: 'En retard',
  oui: 'Attend votre oui',
  clos: 'Clos',
};

/* ── LES DATES, SANS FUSEAU ─────────────────────────────────────────── */
const jourDe = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, (m || 1) - 1, j || 1) / 86400000;
};
const isoDe = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);

/** Le lundi de la semaine d'une date. */
export const lundiDe = (iso: string): string => {
  const n = jourDe(iso);
  const jds = new Date(n * 86400000).getUTCDay(); // 0 = dimanche
  return isoDe(n - ((jds + 6) % 7));
};
export const ajouteJours = (iso: string, k: number): string => isoDe(jourDe(iso) + k);

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 31 oct. 2026 », « 1er nov. 2026 » : l'année toujours, comme partout au Trône. */
export const dateCourte = (iso: string): string => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[(m || 1) - 1]} ${a}`;
};

/* ── LES TÂCHES D'UN PROJET ─────────────────────────────────────────── */
export const tachesDu = (projetId: string, taches: readonly TacheDuProjet[]): TacheDuProjet[] =>
  taches.filter((t) => t.projetId === projetId);

export function avancementDe(taches: readonly TacheDuProjet[]): { faites: number; total: number; pct: number } {
  const total = taches.length;
  const faites = taches.filter((t) => t.close).length;
  return { faites, total, pct: total ? Math.round((faites / total) * 100) : 0 };
}

/** Une tâche ouverte dont l'échéance est passée. */
export const tacheEnRetard = (t: TacheDuProjet, aujourdhui: string): boolean =>
  !t.close && !!t.echeance && t.echeance < aujourdhui;

/** L'ÉTAT SE LIT, IL NE SE COCHE PAS.
    · clos, attente : ce que la direction a décidé ;
    · en retard : une tâche ouverte a dépassé son échéance, OU un jalon passé
      garde des tâches ouvertes, OU la fin est passée avec du travail ouvert ;
    · sinon, à l'heure. */
export function etatDuProjet(p: Pick<Projet, 'statut' | 'fin' | 'jalons'>, taches: readonly TacheDuProjet[], aujourdhui: string): EtatDuProjet {
  if (p.statut === 'clos') return 'clos';
  if (p.statut === 'attente') return 'oui';
  const ouvertes = taches.filter((t) => !t.close);
  if (ouvertes.some((t) => tacheEnRetard(t, aujourdhui))) return 'retard';
  const jalonPasseOuvert = p.jalons.some((j) => j.date < aujourdhui && ouvertes.some((t) => t.jalonId === j.id));
  if (jalonPasseOuvert) return 'retard';
  if (p.fin < aujourdhui && ouvertes.length > 0) return 'retard';
  return 'heure';
}

/** L'ordre du travail : la plus proche échéance d'abord, les sans-date après. */
const parEcheance = (a: TacheDuProjet, b: TacheDuProjet): number =>
  (a.echeance || '9999').localeCompare(b.echeance || '9999') || (a.at ?? '').localeCompare(b.at ?? '');

/** LA PROCHAINE ÉTAPE : la tâche ouverte la plus pressée. */
export function prochaineEtape(taches: readonly TacheDuProjet[]): TacheDuProjet | null {
  return [...taches].filter((t) => !t.close).sort(parEcheance)[0] ?? null;
}

/** Le prochain jalon non atteint (au moins une tâche ouverte, ou date à venir). */
export function prochainJalon(p: Pick<Projet, 'jalons'>, taches: readonly TacheDuProjet[], aujourdhui: string): JalonDuProjet | null {
  const tries = [...p.jalons].sort((a, b) => a.date.localeCompare(b.date));
  return tries.find((j) => taches.some((t) => t.jalonId === j.id && !t.close) || j.date >= aujourdhui) ?? null;
}

/** Un jalon est atteint quand toutes ses tâches sont faites (et qu'il en a). */
export function etatDuJalon(j: JalonDuProjet, taches: readonly TacheDuProjet[]): { total: number; restent: number; atteint: boolean } {
  const leurs = taches.filter((t) => t.jalonId === j.id);
  const restent = leurs.filter((t) => !t.close).length;
  return { total: leurs.length, restent, atteint: leurs.length > 0 && restent === 0 };
}

/* ── LE TABLEAU : DES COLONNES QUI SE CALCULENT ─────────────────────── */
export type ColonneDuTableau = 'retard' | 'semaine' | 'plus-tard' | 'sans-date' | 'fait';
export const COLONNES_DU_TABLEAU: { cle: ColonneDuTableau; nom: string }[] = [
  { cle: 'retard', nom: 'En retard' },
  { cle: 'semaine', nom: 'Dans les 7 jours' },
  { cle: 'plus-tard', nom: 'Plus tard' },
  { cle: 'sans-date', nom: 'Sans date' },
  { cle: 'fait', nom: 'Fait' },
];
export function colonneDe(t: TacheDuProjet, aujourdhui: string): ColonneDuTableau {
  if (t.close) return 'fait';
  if (!t.echeance) return 'sans-date';
  if (t.echeance < aujourdhui) return 'retard';
  return t.echeance <= ajouteJours(aujourdhui, 6) ? 'semaine' : 'plus-tard';
}

/* ── LE CALENDRIER : DES POSITIONS EN POURCENTS ─────────────────────── */
/** La fenêtre du calendrier : du lundi de la première date au dimanche de la
    dernière, avec aujourd'hui toujours dedans. */
export function fenetreDu(projets: readonly Pick<Projet, 'debut' | 'fin'>[], aujourdhui: string): { debut: string; fin: string } {
  const debuts = [aujourdhui, ...projets.map((p) => p.debut)].sort();
  const fins = [aujourdhui, ...projets.map((p) => p.fin)].sort();
  return { debut: lundiDe(debuts[0]), fin: ajouteJours(lundiDe(fins[fins.length - 1]), 6) };
}
/** La place d'une date dans la fenêtre, de 0 à 100, bornée. */
export function positionDans(fenetre: { debut: string; fin: string }, iso: string): number {
  const d0 = jourDe(fenetre.debut);
  const span = jourDe(fenetre.fin) + 1 - d0;
  const x = ((jourDe(iso) - d0) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(x * 100) / 100));
}
/** Les premiers du mois dans la fenêtre, pour l'en-tête. */
export function moisDeLaFenetre(fenetre: { debut: string; fin: string }): { iso: string; nom: string }[] {
  const out: { iso: string; nom: string }[] = [];
  const [a0, m0] = fenetre.debut.split('-').map(Number);
  let a = a0; let m = m0;
  out.push({ iso: fenetre.debut, nom: MOIS_COURTS[m - 1] });
  for (;;) {
    m += 1; if (m > 12) { m = 1; a += 1; }
    const iso = `${a}-${String(m).padStart(2, '0')}-01`;
    if (iso > fenetre.fin) break;
    out.push({ iso, nom: m === 1 ? `${MOIS_COURTS[0]} ${a}` : MOIS_COURTS[m - 1] });
  }
  return out;
}

/* ── L'ÉQUIPE : QUI PORTE QUOI ──────────────────────────────────────── */
export type Membre = { mail: string; nom: string };

/** Une échéance tombe-t-elle dans la fenêtre i (sept jours dès debuts[i]) ?
    La PREMIÈRE fenêtre garde aussi le retard : il reste à faire maintenant. */
const dansLaFenetre = (echeance: string, debuts: readonly string[], i: number): boolean =>
  echeance <= ajouteJours(debuts[i], 6) && (i === 0 || echeance >= debuts[i]);

/** Les tâches ouvertes de chacun, fenêtre par fenêtre de sept jours. Une
    tâche sans date ne tombe dans aucune fenêtre ; elle est comptée à part. */
export function tachesParSemaine(
  taches: readonly TacheDuProjet[],
  membres: readonly Membre[],
  debuts: readonly string[],
): { mail: string; nom: string; parSemaine: number[]; sansDate: number }[] {
  return membres.map((m) => {
    const siennes = taches.filter((t) => !t.close && (t.demandePour ?? '').toLowerCase() === m.mail.toLowerCase());
    const parSemaine = debuts.map((_, i) => siennes.filter((t) => !!t.echeance && dansLaFenetre(t.echeance, debuts, i)).length);
    return { mail: m.mail, nom: m.nom, parSemaine, sansDate: siennes.filter((t) => !t.echeance).length };
  });
}

/** LE NOM D'UN MAÎTRE DANS L'AGENDA. Un rendez-vous porte un prénom
    (`master`) ; une fiche porte un nom complet. On rapproche par le premier
    mot, sans accents ni casse : « Gérard » et « Gerard D. » sont la même main. */
const plie = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().split(/\s+/)[0] ?? '';
export const memeMain = (a: string, b: string): boolean => !!plie(a) && plie(a) === plie(b);

/** Les séances de chacun, semaine par semaine : pour mémoire, jamais
    additionnées aux tâches (choix du 24 octobre 2026). */
export function seancesParSemaine(
  rdvs: readonly { date: string; status: string; master?: string }[],
  nom: string,
  debuts: readonly string[],
): number[] {
  return debuts.map((d) => {
    const fin = ajouteJours(d, 6);
    return rdvs.filter((r) => r.status !== 'annulé' && r.date >= d && r.date <= fin && memeMain(r.master ?? '', nom)).length;
  });
}

/** CE QUE L'ASSISTANT PROPOSE : rééquilibrer, jamais décider.
    Une fenêtre où quelqu'un porte au moins trois tâches de projets de plus
    que la personne la moins chargée, il propose de confier à cette dernière
    la tâche la plus lointaine de la plus chargée. Rien ne bouge sans un oui. */
export const ECART_POUR_PROPOSER = 3;
export function propositionDeConfier(
  charge: readonly { mail: string; nom: string; parSemaine: number[] }[],
  taches: readonly TacheDuProjet[],
  debuts: readonly string[],
): { semaine: string; tacheId: string; texte: string; de: Membre; a: Membre; avant: [number, number] } | null {
  if (charge.length < 2) return null;
  for (let i = 0; i < debuts.length; i++) {
    const tries = [...charge].sort((x, y) => y.parSemaine[i] - x.parSemaine[i] || x.nom.localeCompare(y.nom));
    const plus = tries[0];
    const moins = tries[tries.length - 1];
    if (plus.parSemaine[i] - moins.parSemaine[i] < ECART_POUR_PROPOSER) continue;
    const candidates = taches
      .filter((t) => !t.close && !!t.projetId && !!t.echeance
        && (t.demandePour ?? '').toLowerCase() === plus.mail.toLowerCase()
        && dansLaFenetre(t.echeance, debuts, i))
      .sort((a, b) => (b.echeance ?? '').localeCompare(a.echeance ?? '') || a.id.localeCompare(b.id));
    const t = candidates[0];
    if (!t) continue;
    return {
      semaine: debuts[i], tacheId: t.id, texte: t.texte,
      de: { mail: plus.mail, nom: plus.nom }, a: { mail: moins.mail, nom: moins.nom },
      avant: [plus.parSemaine[i], moins.parSemaine[i]],
    };
  }
  return null;
}

/* ── LES FILTRES DE LA LISTE ────────────────────────────────────────── */
export type FiltreDesProjets = 'tous' | 'miens' | 'attention';
export function filtreLesProjets<P extends Pick<Projet, 'piloteMail' | 'statut'>>(
  projets: readonly P[],
  filtre: FiltreDesProjets,
  monMail: string,
  etatDe: (p: P) => EtatDuProjet,
): P[] {
  const visibles = projets.filter((p) => p.statut !== 'clos');
  if (filtre === 'miens') return visibles.filter((p) => p.piloteMail.toLowerCase() === monMail.toLowerCase());
  if (filtre === 'attention') return visibles.filter((p) => etatDe(p) !== 'heure');
  return visibles;
}

/** UN PROJET SE TIENT : un nom, un pilote, des dates dans l'ordre, des
    jalons nommés et datés. Le message dit ce qui manque, en une phrase. */
export function projetIncomplet(p: Pick<Projet, 'nom' | 'piloteMail' | 'debut' | 'fin' | 'jalons'>): string | null {
  if (!p.nom.trim()) return 'Donnez un nom au projet.';
  if (!p.piloteMail.trim()) return 'Choisissez le pilote.';
  if (!p.debut || !p.fin) return 'Posez la date de début et la date de fin.';
  if (p.fin < p.debut) return 'La fin vient avant le début.';
  if (p.jalons.some((j) => !j.nom.trim() || !j.date)) return 'Chaque jalon a un nom et une date.';
  return null;
}

/* ── MES TÂCHES, AU TÉLÉPHONE ───────────────────────────────────────
   Vue 7 de la maquette : la liste de qui travaille, sans colonnes. Ce qui
   est en retard et ce qui est dû aujourd'hui vient en tête, ensemble : les
   deux sont « maintenant ». */
export type SectionDeMaTache = 'maintenant' | 'semaine' | 'plus-tard' | 'sans-date';
export const SECTIONS_DE_MES_TACHES: { cle: SectionDeMaTache; nom: string }[] = [
  { cle: 'maintenant', nom: 'Aujourd’hui' },
  { cle: 'semaine', nom: 'Dans les 7 jours' },
  { cle: 'plus-tard', nom: 'Plus tard' },
  { cle: 'sans-date', nom: 'Sans date' },
];
export function sectionDeMaTache(echeance: string | undefined, aujourdhui: string): SectionDeMaTache {
  if (!echeance) return 'sans-date';
  if (echeance <= aujourdhui) return 'maintenant';
  return echeance <= ajouteJours(aujourdhui, 6) ? 'semaine' : 'plus-tard';
}
