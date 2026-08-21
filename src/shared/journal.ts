/* LE JOURNAL DES GESTES — 21 août 2026.

   « Je dois tracker systématiquement qui fait quoi et quand sur Le Trône. »

   Né d'une question restée sans réponse : QUI a créé le rendez-vous de
   Diane C. du 18 août ? La base ne pouvait pas le dire — aucun champ d'auteur
   nulle part, et `updated_at` ne parle que de la dernière écriture.

   CE FICHIER NE FAIT QUE DÉCRIRE ET NOMMER. La capture, elle, vit à UN seul
   endroit : `pushDiff` dans sync.ts, le point par lequel passe toute écriture
   de toute collection. Instrumenter écran par écran laisserait des trous, et
   un journal troué ment plus qu'il n'informe — on croirait que rien ne s'est
   passé là où personne n'a pensé à poser la ligne. */

import { supabase } from './supabase';

export type GesteVerbe = 'pose' | 'modifie' | 'efface';

/** Un changement nommé — « Prix · 60 000 F → 15 000 F ». */
export type ChampChange = { champ: string; avant?: string; apres?: string };

export type Geste = {
  id: string;
  branchId?: string;
  /** L'instant, en ISO — c'est lui qui trie et qui purge. */
  quand: string;
  /** Le compte connecté. Absent quand le geste vient d'une cliente. */
  parMail?: string;
  /** Le nom, FIGÉ à l'inscription : un compte renommé demain ne réécrit pas
      un geste d'hier. Même règle que la provenance des dépenses. */
  parNom: string;
  /** Par quelle porte le geste est entré. */
  porte: 'trone' | 'couronne' | 'consultation';
  verbe: GesteVerbe;
  /** Le nom technique de la collection — pour filtrer sans ambiguïté. */
  table: string;
  /** L'écran, en français — c'est ce que l'œil lit. */
  ecran: string;
  pieceId: string;
  /** Le libellé de la pièce touchée, figé lui aussi. */
  piece: string;
  champs?: ChampChange[];
};

/* ── CE QU'UNE MAIN TOUCHE ──────────────────────────────────────────
   Arbitrage de la Maison : on journalise ce qu'une main touche, et rien de la
   mécanique interne (échos de synchronisation, files d'attente, compteurs,
   sessions des clientes). Une table absente de cette carte n'est pas
   journalisée — c'est la liste qui autorise, jamais une liste d'exclusions :
   une table nouvelle n'entre au journal que si on l'y met, jamais par
   accident. */
type Carte = { ecran: string; nomme: (d: Record<string, unknown>) => string };

const texte = (v: unknown): string => (v == null ? '' : String(v));
const jour = (v: unknown): string => {
  const s = texte(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(`${s}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export const CARTE_DES_TABLES: Record<string, Carte> = {
  appointments: { ecran: 'Le Carnet', nomme: (d) => `Rituel · ${texte(d.clientName) || 'cliente'} · ${jour(d.date)}` },
  invoices: { ecran: 'Factures & devis', nomme: (d) => `${texte(d.number) || 'Pièce'} · ${texte(d.clientName) || 'cliente'}` },
  clients: { ecran: 'Clientes', nomme: (d) => `Fiche · ${texte(d.name) || 'sans nom'}` },
  expenses: { ecran: 'Dépenses', nomme: (d) => `Dépense · ${texte(d.label)}` },
  cashboxes: { ecran: 'Dépenses · caisses', nomme: (d) => `Caisse · ${texte(d.name)}` },
  expense_categories: { ecran: 'Dépenses · catégories', nomme: (d) => `Catégorie · ${texte(d.name)}` },
  budgets: { ecran: 'Dépenses · budgets', nomme: (d) => `Budget · ${texte(d.category)}` },
  coffre_movements: { ecran: 'Le Coffre', nomme: (d) => `Coffre · ${texte(d.kind)} · ${jour(d.date)}` },
  credit_movements: { ecran: 'Comptes & Avoirs', nomme: (d) => `Avoir · ${texte(d.kind)} · ${jour(d.date)}` },
  payments: { ecran: 'Encaissements', nomme: (d) => `Paiement en ligne · ${jour(d.date)}` },
  tips: { ecran: 'Pourboires', nomme: (d) => `Pourboire · ${texte(d.clientName) || jour(d.date)}` },
  catalog_services: { ecran: 'Catalogue', nomme: (d) => `Prestation · ${texte(d.name)}` },
  catalog_categories: { ecran: 'Catalogue · ateliers', nomme: (d) => `Atelier · ${texte(d.name)}` },
  catalog_products: { ecran: 'Catalogue · produits', nomme: (d) => `Produit · ${texte(d.name)}` },
  team: { ecran: 'Personnel & paie', nomme: (d) => `Membre · ${texte(d.name)}` },
  plans: { ecran: 'Abonnements', nomme: (d) => `Formule · ${texte(d.name)}` },
  subscribers: { ecran: 'Abonnements', nomme: (d) => `Abonnée · ${texte(d.name) || texte(d.clientId)}` },
  families: { ecran: 'Comptes famille', nomme: (d) => `Compte · ${texte(d.name)}` },
  personas: { ecran: 'Personas', nomme: (d) => `Persona · ${texte(d.name)}` },
  branches: { ecran: 'Les branches', nomme: (d) => `Branche · ${texte(d.name)}` },
  stock_produits: { ecran: 'Stock & achats', nomme: (d) => `Article · ${texte(d.nom)}` },
  stock_mouvements: { ecran: 'Stock & achats', nomme: (d) => `Mouvement · ${texte(d.motif) || jour(d.date)}` },
  fournisseurs: { ecran: 'Stock & achats', nomme: (d) => `Fournisseur · ${texte(d.nom)}` },
  achats_commandes: { ecran: 'Stock & achats', nomme: (d) => `Commande · ${texte(d.reference) || jour(d.date)}` },
  lab_formules: { ecran: 'Le Laboratoire', nomme: (d) => `Formule · ${texte(d.nom)}` },
  lab_preparations: { ecran: 'Le Laboratoire', nomme: (d) => `Préparation · ${texte(d.nom) || jour(d.date)}` },
  formations: { ecran: 'Académie', nomme: (d) => `Formation · ${texte(d.nom) || texte(d.name)}` },
  apprenants: { ecran: 'Académie', nomme: (d) => `Apprenant · ${texte(d.name) || texte(d.nom)}` },
  certifications: { ecran: 'Académie', nomme: (d) => `Certification · ${texte(d.nom) || texte(d.name)}` },
  campaigns: { ecran: 'Marketing', nomme: (d) => `Campagne · ${texte(d.name) || texte(d.nom)}` },
  fil_messages: { ecran: 'Le Fil & Le Tableau', nomme: (d) => `Message · ${texte(d.texte).slice(0, 40)}` },
  blocages: { ecran: 'Le Carnet', nomme: (d) => `Indisponibilité · ${jour(d.date)}` },
  motifs_foyer: { ecran: 'Salon & Foyer', nomme: (d) => `Motif · ${texte(d.nom)}` },
  caisses_indep: { ecran: 'Salon & Foyer', nomme: (d) => `Caisse · ${texte(d.nom)}` },
  caisses_indep_mouvements: { ecran: 'Salon & Foyer', nomme: (d) => `Écriture · ${texte(d.label) || jour(d.date)}` },
  prelevements: { ecran: 'Salon & Foyer', nomme: (d) => `Prélèvement · ${jour(d.date)}` },
  prets_associes: { ecran: 'Salon & Foyer', nomme: (d) => `Prêt · ${texte(d.nom) || jour(d.date)}` },
  enfants_declares: { ecran: 'Comptes famille', nomme: (d) => `Enfant · ${texte(d.prenom) || texte(d.name)}` },
  consommations: { ecran: 'Salon & Foyer', nomme: (d) => `Consommation · ${jour(d.date)}` },
  bilans: { ecran: 'Bilan mensuel', nomme: (d) => `Bilan · ${texte(d.mois) || jour(d.date)}` },
};

export const tableSuivie = (table: string): boolean => table in CARTE_DES_TABLES;

/* ── LES CHAMPS, EN FRANÇAIS ────────────────────────────────────────
   Sans ce dictionnaire, le journal dirait « priceXof: 60000 → 15000 » : une
   ligne lisible par un développeur et par personne d'autre. Un champ absent
   d'ici n'est pas montré — mieux vaut taire un détail technique que remplir
   l'écran de bruit. */
export const NOM_DES_CHAMPS: Record<string, string> = {
  date: 'Date', time: 'Heure', status: 'Statut', master: 'Maître',
  clientName: 'Cliente', clientId: 'Cliente', serviceIds: 'Prestations',
  priceXof: 'Prix', discountPct: 'Remise', discountXof: 'Remise',
  amountXof: 'Montant', totalXof: 'Total', deposit: 'Acompte', depositXof: 'Acompte',
  payment: 'Moyen', cashbox: 'Caisse', payments: 'Versements', number: 'Numéro',
  tipXof: 'Pourboire', avoirXof: 'Réglé par avoir', lines: 'Lignes',
  name: 'Nom', nom: 'Nom', phone: 'Téléphone', email: 'E-mail', city: 'Ville',
  segments: 'Segments', notes: 'Notes', longueur: 'Longueur', lockCount: 'Nombre de locks',
  crownSince: 'Couronne depuis', since: 'Cliente depuis', familyId: 'Compte famille',
  label: 'Libellé', category: 'Catégorie', subcategory: 'Sous-catégorie',
  items: 'Articles', sources: 'Revenus désignés', recurring: 'Récurrence',
  flagged: 'Signalée', stopped: 'Suspendue', paused: 'En pause',
  role: 'Rôle', rubrics: 'Accès', compteMail: 'E-mail de connexion',
  openingXof: 'Solde d’ouverture', currency: 'Devise',
  sessions: 'Séances', durationMin: 'Durée', categoryId: 'Atelier', palier: 'Palier',
  seriesId: 'Série', seriesIndex: 'Séance', seriesTotal: 'Séances',
  coveredBySub: 'Couvert par l’abonnement', offertPar: 'Offert par',
  kind: 'Nature', note: 'Note', method: 'Moyen', holderId: 'Porteur',
  demandePour: 'Demandé à', echeance: 'Échéance', priorite: 'Priorité',
  texte: 'Message', qty: 'Quantité', unitXof: 'Prix unitaire',
};

/** Les champs qu'on ne montre jamais — bruit de machine, jamais un geste. */
const CHAMPS_MUETS = new Set(['id', 'branchId', 'updatedAt', 'pointsAwarded', 'source']);

const lisible = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length} élément(s)`;
  if (typeof v === 'object') return 'détail';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** CE QUI A CHANGÉ, nommé. Compare deux états d'une même pièce et rend les
    champs connus qui diffèrent. Un objet ou une liste ne se déplie pas : on
    dit qu'il a changé, pas comment — le journal doit tenir sur une ligne. */
export function champsChanges(
  avant: Record<string, unknown> | undefined,
  apres: Record<string, unknown>,
): ChampChange[] {
  if (!avant) return [];
  const out: ChampChange[] = [];
  const cles = new Set([...Object.keys(avant), ...Object.keys(apres)]);
  for (const c of cles) {
    if (CHAMPS_MUETS.has(c)) continue;
    const nom = NOM_DES_CHAMPS[c];
    if (!nom) continue; // champ technique : on se tait plutôt que de faire du bruit
    const a = avant[c];
    const b = apres[c];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ champ: nom, avant: lisible(a), apres: lisible(b) });
  }
  return out;
}

/* ── QUI TIENT LA PLUME ─────────────────────────────────────────────
   sync.ts ne peut pas lire l'annuaire des comptes : il vit sous `shared/`, et
   l'annuaire sous `apps/trone/`. Une dépendance dans ce sens retournerait
   l'architecture et fabriquerait un cycle. Chaque application POSE donc son
   identité au démarrage et à chaque changement de session ; la couche de
   synchronisation se contente de la lire.

   Tant que rien n'est posé, le geste est inscrit sans nom plutôt que sous un
   nom faux — un journal qui attribue à tort vaut moins que pas de journal. */
export type Identite = { mail?: string; nom: string; porte: Geste['porte'] };

let identite: Identite = { nom: 'Main inconnue', porte: 'trone' };

export const poseLIdentite = (i: Identite): void => { identite = i; };
export const identiteCourante = (): Identite => identite;

/* ── L'INSCRIPTION ──────────────────────────────────────────────────
   EN AJOUT SEUL, ET JAMAIS BLOQUANTE. La ligne part APRÈS l'écriture qu'elle
   observe : si le journal échoue (hors ligne, droits, table absente), le geste
   du comptoir est déjà passé. On ne bloque pas une vente pour une trace. */
export async function inscrisLesGestes(gestes: Geste[]): Promise<void> {
  if (!supabase || gestes.length === 0) return;
  try {
    await supabase.from('journal_gestes').insert(
      gestes.map((g) => ({ id: g.id, branch_id: g.branchId ?? null, data: g })),
    );
  } catch {
    /* Silence volontaire : une trace manquée ne doit jamais remonter au
       comptoir sous forme d'alerte. Le geste, lui, est écrit. */
  }
}

/** Lecture — réservée aux souverains par la politique du serveur : un compte
    sans le rang reçoit une liste vide, pas une erreur. */
export async function litLeJournal(mois: string): Promise<Geste[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('journal_gestes')
    .select('data')
    .gte('data->>quand', `${mois}-01`)
    .lt('data->>quand', `${mois}-32`)
    .order('data->>quand', { ascending: false })
    .limit(4000);
  if (error) return [];
  return (data ?? []).map((r) => (r as { data: Geste }).data);
}
