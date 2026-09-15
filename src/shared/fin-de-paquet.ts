import { supabase } from './supabase';
import { quandTablePrete } from './sync';
import {
  comptesAbonnement, paquetsEnFin, subscribersStore, plansStore, type FinDePaquet,
} from './abonnements';
import { appointmentsStore } from './agenda';
import { clientsStore } from './clients';
import { numeroWa, MODELE_FIN_DE_PAQUET } from './conversations';
import { envoieSurWhatsApp, jourDit } from './whatsapp';

/* ══ LA FIN DE PAQUET, ENVOYÉE PAR LE TRÔNE — 15 septembre 2026 ═══════
   Maquette `public/maquette-la-fin-de-paquet.html`, validée.

   « Il vous reste 2 soins, jusqu'au 12 juin : c'est le message qui rapporte
   le plus, mais il part hors fenêtre. Il lui faut son modèle Meta. »

   LE TRÔNE JUGE, ET IL ENVOIE. AUCUN RÉVEIL SERVEUR. Le juge des paquets
   (`paquetsEnFin`, sur `usageDetaille`) vit ici, avec les calibres, les
   quotas propres et les fenêtres de cycle : le recopier dans une fonction
   Edge ferait deux compteurs, et un jour deux vérités. À chaque ouverture du
   Trône par quelqu'un de la Maison, une fois les quatre tables résolues, on
   regarde les paquets en cours et l'on envoie ce qui touche au seuil par
   `whatsapp-envoi`, la porte qui existe déjà.

   DEUX POSTES NE FONT PAS DEUX MESSAGES. Avant d'envoyer, on POSE une ligne
   `env-paquet-<contrat>` dans le journal des envois — une insertion, pas un
   upsert : la clé primaire ne se prend qu'une fois, et le second poste voit
   le refus et se tait. Un échec d'hier se reprend, une fois par jour, par une
   mise à jour conditionnelle qui ne réussit qu'à un seul.

   JAMAIS LA NUIT. Entre 9 h 30 et 21 h 30 à Cotonou, comme l'avis Google. Un
   poste ouvert à 7 h attend le prochain passage.

   PAS DE VENTE DANS LE MESSAGE : il informe (utilitaire chez Meta), la suite
   se propose au fauteuil. Une fois par paquet, jamais de relance. */

/** L'heure qu'il est au salon, en heures décimales (9 h 30 = 9,5). */
export const heureAuSalon = (instant: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Porto-Novo', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
};

/** ON N'ÉCRIT PAS LA NUIT : de 9 h 30 à 21 h 30. */
export const estLHeureDEcrire = (heure: number = heureAuSalon()): boolean => heure >= 9.5 && heure < 21.5;

/** Le prénom, tel qu'on l'écrit dans un message : le premier mot du nom. */
const prenomDe = (nom: string): string => nom.trim().split(/\s+/)[0] || 'Madame';

/** LES QUATRE VARIABLES DU MODÈLE `fin_de_paquet` (docs/BRANCHER-ENVOIS.md,
    étape 7) : le prénom, ce qui reste, la formule, la validité. Un paquet
    sans date dit « sans date limite » : une variable ne peut pas être vide
    chez Meta, et la phrase reste juste. */
export const variablesDeLaFinDePaquet = (f: FinDePaquet): string[] => [
  prenomDe(f.nom),
  `${f.reste} séance${f.reste > 1 ? 's' : ''}`,
  f.formule,
  f.jusquau ? `valable jusqu’au ${jourDit(f.jusquau)}` : 'sans date limite',
];

/** CE QU'ELLE LIT, tel que le fil du Trône le garde : le même texte que le
    modèle approuvé, variables posées. */
export const phraseDeLaFinDePaquet = (f: FinDePaquet): string => {
  const [prenom, reste, formule, validite] = variablesDeLaFinDePaquet(f);
  return `Bonjour ${prenom}, il vous reste ${reste} sur votre ${formule}, ${validite}. Pensez à réserver : nous vous gardons votre place.`;
};

/** L'identifiant du verrou, une ligne par contrat, pour la vie du paquet. */
export const idDuVerrou = (subId: string): string => `env-paquet-${subId}`;

/** LES CONTRATS DÉJÀ TRAITÉS DANS CE CHARGEMENT : un passage toutes les six
    heures ne relit pas ce qu'il a déjà posé. Le verrou en base tient de toute
    façon. */
const dejaCeChargement = new Set<string>();

export type BilanDuPassage = { envoyes: number; refus: number; sansNumero: number; verrouilles: number };

/** UN PASSAGE : juge, verrouille, envoie, consigne. Ne lance jamais rien
    hors des heures du salon, ni sans connexion. */
export async function previensLesFinsDePaquet(o: { branchId: string }): Promise<BilanDuPassage> {
  const bilan: BilanDuPassage = { envoyes: 0, refus: 0, sansNumero: 0, verrouilles: 0 };
  if (!supabase || !estLHeureDEcrire()) return bilan;
  const sb = supabase;
  const aujourdhui = jourLocal();
  const subs = subscribersStore.get().filter((s) => s.branchId === o.branchId);
  if (subs.length === 0) return bilan;
  const comptes = comptesAbonnement({
    subs, plans: plansStore.get(), appts: appointmentsStore.get(), aujourdhui,
  });
  const alertes = paquetsEnFin(comptes.flatMap((c) => c.contrats), aujourdhui);
  const clients = clientsStore.get();

  for (const f of alertes) {
    if (dejaCeChargement.has(f.sub.id)) continue;
    dejaCeChargement.add(f.sub.id);
    /* DÉJÀ PRÉVENUE : le raccourci de l'écran suffit à ne pas retenter. */
    if (f.sub.finPrevenueLe) continue;
    const fiche = clients.find((c) => c.id === f.clientId);
    const numero = numeroWa(fiche?.phone) || numeroWa(fiche?.phone2);
    if (!numero) { bilan.sansNumero += 1; continue; }

    const id = idDuVerrou(f.sub.id);
    const quand = new Date().toISOString();
    const socle = {
      id, branchId: o.branchId, type: 'fin-de-paquet', canal: 'whatsapp',
      clientId: f.clientId, subId: f.sub.id, motif: f.motif, reste: f.reste, jusquau: f.jusquau,
    };
    /* ── ① LE VERROU : une insertion, un seul gagnant ────────────────── */
    const { error: errPose } = await sb.from('envois').insert({
      id, branch_id: o.branchId, data: { ...socle, statut: 'en cours', quand },
    });
    if (errPose) {
      /* Déjà posé. Un ÉCHEC d'hier se reprend, une fois par jour ; la mise
         à jour conditionnelle ne rend une ligne qu'à un seul poste. */
      const hier = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: reprise } = await sb.from('envois')
        .update({ data: { ...socle, statut: 'en cours', quand, reprise: true }, updated_at: quand })
        .eq('id', id).eq('data->>statut', 'échec').lt('data->>quand', hier)
        .select('id');
      if (!(reprise ?? []).length) { bilan.verrouilles += 1; continue; }
    }

    /* ── ② L'ENVOI, par la porte qui existe ────────────────────────── */
    const r = await envoieSurWhatsApp({
      numero,
      modele: MODELE_FIN_DE_PAQUET,
      variables: variablesDeLaFinDePaquet(f),
      /* Le fil garde les mots qu'elle lit, pas le nom du modèle. */
      texte: phraseDeLaFinDePaquet(f),
      clientId: f.clientId,
      branchId: o.branchId,
      parQui: 'la Maison, automatiquement',
    });

    /* ── ③ LE VERDICT, consigné même raté ──────────────────────────── */
    const fin = new Date().toISOString();
    await sb.from('envois').update({
      data: {
        ...socle, quand,
        statut: r.ok ? 'envoyé' : 'échec',
        ...(r.ok ? { waMessageId: r.waId, envoyeLe: fin } : { detail: r.erreur.slice(0, 300) }),
      },
      updated_at: fin,
    }).eq('id', id);
    if (r.ok) {
      bilan.envoyes += 1;
      subscribersStore.set((prev) => prev.map((s) => (s.id === f.sub.id ? { ...s, finPrevenueLe: fin } : s)));
    } else {
      bilan.refus += 1;
      console.warn(`[mnd-fin-de-paquet] ${f.sub.reference ?? f.sub.id} : ${r.erreur}`);
    }
  }
  return bilan;
}

/** Le jour LOCAL, pas UTC : entre minuit et une heure à Cotonou, la date
    UTC est encore celle d'hier. */
const jourLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** LES QUATRE TABLES QU'IL FAUT AVOIR LUES avant de juger. Un compteur
    calculé sur un cache d'hier dirait « il vous reste 2 » à qui n'en a plus. */
const TABLES = ['appointments', 'clients', 'subscribers', 'plans'] as const;

/** Appelle `fn` quand les quatre tables sont résolues, puis toutes les six
    heures tant que la page vit. Rend de quoi arrêter. */
export function surveilleLesFinsDePaquet(fn: () => void): () => void {
  let arrete = false;
  let restant = TABLES.length;
  const passe = () => { if (!arrete) fn(); };
  for (const t of TABLES) quandTablePrete(t, () => { restant -= 1; if (restant === 0) passe(); });
  const t = window.setInterval(passe, 6 * 3600_000);
  return () => { arrete = true; window.clearInterval(t); };
}
