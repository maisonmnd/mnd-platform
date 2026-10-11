/* LES FAITS DU JOUR — 11 octobre 2026.

   Ce que le Centre de commande sait d'une journée, en chiffres, SANS AUCUN
   NOM : le nombre de rendez-vous et leurs heures, les demandes du site, ce
   qui attend un fondateur, l'encaissé du mois. Le Trône les calcule pour
   l'écran ; la fonction `centre-de-commande` les calcule aussi pour le
   briefing du matin, et c'est la même forme qu'elle envoie à Claude.

   LE BRIEFING DE BASE s'écrit ici, sans Claude : le Centre dit sa journée
   dès sa mise en ligne, même si la fonction n'est pas encore posée ou si le
   plafond du mois est atteint. Claude, quand il répond, y ajoute l'ordre
   des priorités et les propositions.

   MODULE PUR ET SANS IMPORT : copié entre repères dans la fonction. */

export type FaitsDuJour = {
  jour: string;
  rdv: { nombre: number; premiere?: string; derniere?: string };
  demandesNouvelles: number;
  envoisEnAttente?: number;
  encaisse?: { aCeJour: number; moisPrecedent?: number; projete?: number; depenses?: number; releveLe?: string };
  offres: { titre: string; remise: string; jusquau?: string }[];
  validationsEnAttente: number;
  tachesEnRetard: number;
  missionsOuvertes: number;
  /** L'atelier des contenus (phase 2) : ce qui attend une relecture, ce qui sort aujourd'hui. */
  contenus?: { aRelire: number; aujourdHui: number };
  /** Pour les rapports de la semaine et du mois : la période qu'ils couvrent. */
  periode?: { du: string; au: string; rdv: number; honores: number; annules: number; demandes: number };
};

/** « 2026-10-11 » : le jour à Cotonou, quel que soit le fuseau de l'appareil. */
export function jourDeCotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Le jour `n` jours après (ou avant, si `n` est négatif). */
export function decaleLeJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « dimanche 11 octobre 2026 », « 1er » pour le premier du mois. */
export function jourEnClair(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const j = Number(m[3]);
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/** « 9 h », « 18 h 30 ». */
export function heureEnClair(hhmm?: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return Number(m[2]) ? `${Number(m[1])} h ${m[2]}` : `${Number(m[1])} h`;
}

/** « 1 245 000 F » : espaces insécables fines entre les milliers. */
export function francs(n: number): string {
  const entier = Math.round(Number.isFinite(n) ? n : 0);
  const signe = entier < 0 ? '-' : '';
  return `${signe}${String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Le briefing écrit sans Claude : une ligne par fait qui compte, dans
    l'ordre où l'on agit (ce qui attend un geste d'abord). */
export function briefingDeBase(f: FaitsDuJour): { titre: string; points: string[] } {
  const points: string[] = [];
  if (f.validationsEnAttente > 0) points.push(`${pluriel(f.validationsEnAttente, 'validation vous attend', 'validations vous attendent')} dans le Centre de commande.`);
  if (f.demandesNouvelles > 0) points.push(`${pluriel(f.demandesNouvelles, 'demande du site attend', 'demandes du site attendent')} une réponse.`);
  if (f.tachesEnRetard > 0) points.push(`${pluriel(f.tachesEnRetard, 'tâche a', 'tâches ont')} passé son échéance.`);
  if (f.rdv.nombre > 0) {
    const plage = f.rdv.premiere && f.rdv.derniere && f.rdv.premiere !== f.rdv.derniere
      ? `, de ${heureEnClair(f.rdv.premiere)} à ${heureEnClair(f.rdv.derniere)}`
      : f.rdv.premiere ? `, à ${heureEnClair(f.rdv.premiere)}` : '';
    points.push(`${pluriel(f.rdv.nombre, 'rendez-vous', 'rendez-vous')} aujourd’hui${plage}.`);
  } else {
    points.push('Aucun rendez-vous aujourd’hui.');
  }
  if (f.envoisEnAttente && f.envoisEnAttente > 0) points.push(`${pluriel(f.envoisEnAttente, 'message attend', 'messages attendent')} dans la salle des envois.`);
  if (f.encaisse) {
    const compare = f.encaisse.moisPrecedent !== undefined ? ` (le mois dernier au même jour : ${francs(f.encaisse.moisPrecedent)})` : '';
    points.push(`Encaissé ce mois à ce jour : ${francs(f.encaisse.aCeJour)}${compare}.`);
  }
  for (const o of f.offres.slice(0, 2)) points.push(`L’offre « ${o.titre} » (${o.remise}) court${o.jusquau ? ` jusqu’au ${jourEnClair(o.jusquau).replace(/^\S+ /, '')}` : ''}.`);
  if (f.periode) points.push(`Du ${jourEnClair(f.periode.du).replace(/^\S+ /, '')} au ${jourEnClair(f.periode.au).replace(/^\S+ /, '')} : ${pluriel(f.periode.rdv, 'rendez-vous', 'rendez-vous')}, dont ${f.periode.honores} honorés et ${f.periode.annules} annulés ; ${pluriel(f.periode.demandes, 'demande', 'demandes')} du site.`);
  if (f.contenus && f.contenus.aRelire > 0) points.push(`${pluriel(f.contenus.aRelire, 'publication attend', 'publications attendent')} votre relecture dans l’atelier des contenus.`);
  if (f.contenus && f.contenus.aujourdHui > 0) points.push(`${pluriel(f.contenus.aujourdHui, 'publication est prévue', 'publications sont prévues')} aujourd’hui sur les réseaux.`);
  if (f.missionsOuvertes > 0) points.push(`${pluriel(f.missionsOuvertes, 'mission est ouverte', 'missions sont ouvertes')}.`);
  return { titre: `Le briefing du ${jourEnClair(f.jour)}`, points };
}

/* ── Les tâches en retard et les missions ouvertes ───────────────────────── */
export type TacheResumee = { statut: string; echeance?: string; validation?: unknown };
export type MissionResumee = { statut: string; taches: readonly TacheResumee[] };

const TERMINEE = new Set(['faite', 'refusee', 'validee']);

export function comptesDesMissions(missions: readonly MissionResumee[], jour: string): { validations: number; retard: number; ouvertes: number } {
  let validations = 0, retard = 0, ouvertes = 0;
  for (const m of missions) {
    if (m.statut === 'terminee' || m.statut === 'abandonnee') continue;
    ouvertes += 1;
    for (const t of m.taches) {
      if (t.statut === 'a-valider' && !t.validation) validations += 1;
      if (t.echeance && t.echeance < jour && !TERMINEE.has(t.statut)) retard += 1;
    }
  }
  return { validations, retard, ouvertes };
}
