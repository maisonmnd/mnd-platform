import { supabase } from './supabase';
import { quandTablePrete } from './sync';
import {
  comptesAbonnement, paquetsEnFin, subscribersStore, plansStore, type FinDePaquet,
} from './abonnements';
import { appointmentsStore } from './agenda';
import { invoicesStore } from './finance';
import { clientsStore } from './clients';
import { numeroWa, MODELE_FIN_DE_PAQUET } from './conversations';
import { envoieSurWhatsApp, jourDit } from './whatsapp';
import { appelDe } from './civilite';
import { EN_ATTENTE, REGLES_PAR_DEFAUT, facteurVivant, heureDeDepart } from './salle-des-envois';

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
   se propose au fauteuil. Une fois par paquet, jamais de relance.

   PAR LA SALLE D'ATTENTE (29 octobre 2026, Yéman au sélecteur : « pour que
   je contrôle toujours avant qu'ils partent ») : le message ne part plus
   tout de suite. Il est DÉPOSÉ dans la salle, dix minutes, comme les autres
   envois automatiques ; on peut l'y retenir ou l'écarter, et le facteur
   (`envois-partent`) le porte. Le contrat se dit « prévenu » seulement quand
   le facteur l'a envoyé. Facteur muet : il part comme avant, tout de suite. */

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

/** « 12 janvier 2027 » : le jour du message, AVEC SON ANNÉE (10 octobre 2026,
    revue). Un paquet prévenu en décembre qui expire en janvier disait
    « valable jusqu'au 12 janvier » : de quelle année ? C'est la règle de la
    Maison sur toute date qu'une cliente lit. */
const jourEtAn = (iso: string): string => {
  const a = iso.slice(0, 4);
  return /^\d{4}$/.test(a) ? `${jourDit(iso)} ${a}` : jourDit(iso);
};

/** LES QUATRE VARIABLES DU MODÈLE `fin_de_paquet` (docs/BRANCHER-ENVOIS.md,
    étape 7) : son appel, ce qui reste, la formule, la validité. Un paquet
    sans date dit « sans date limite » : une variable ne peut pas être vide
    chez Meta, et la phrase reste juste.

    SON APPEL, PAS LE PREMIER MOT DE LA FICHE (10 octobre 2026, revue) : la
    civilité vit dans les messages automatiques depuis le 2 octobre
    (`appelDe`, shared/civilite). « Madame Naffi », « Monsieur Koffi » ; une
    fiche absente ou muette est une dame. */
export const variablesDeLaFinDePaquet = (f: FinDePaquet, fiche?: Parameters<typeof appelDe>[0]): string[] => [
  appelDe(fiche, f.nom),
  `${f.reste} séance${f.reste > 1 ? 's' : ''}`,
  f.formule,
  f.jusquau ? `valable jusqu’au ${jourEtAn(f.jusquau)}` : 'sans date limite',
];

/** CE QU'ELLE LIT, tel que le fil du Trône le garde : le même texte que le
    modèle approuvé, variables posées. */
export const phraseDeLaFinDePaquet = (f: FinDePaquet, fiche?: Parameters<typeof appelDe>[0]): string => {
  const [appel, reste, formule, validite] = variablesDeLaFinDePaquet(f, fiche);
  return `Bonjour ${appel}, il vous reste ${reste} sur votre ${formule}, ${validite}. Pensez à réserver : nous vous gardons votre place.`;
};

/** L'identifiant du verrou, une ligne par contrat, pour la vie du paquet. */
export const idDuVerrou = (subId: string): string => `env-paquet-${subId}`;

/** LE COLIS DE LA SALLE : le modèle et ses quatre variables, et les mots
    qu'elle lit, que le facteur écrit dans son fil. */
export const colisDeLaFinDePaquet = (f: FinDePaquet, fiche: Parameters<typeof appelDe>[0], numero: string) => ({
  genre: 'whatsapp' as const, numero, modele: MODELE_FIN_DE_PAQUET,
  composants: [{ type: 'body' as const, parameters: variablesDeLaFinDePaquet(f, fiche).map((text) => ({ type: 'text' as const, text })) }],
  texteAuFil: phraseDeLaFinDePaquet(f, fiche), parQui: 'la Maison, automatiquement',
});

/** CE QUE LE PASSAGE FAIT D'UN CONTRAT, selon la ligne déjà posée à son nom :
    rien encore, la déposer ; envoyée par le facteur, la dire prévenue ; un
    échec d'avant-hier, la redéposer une fois par jour ; tout le reste (en
    salle, retenue, écartée par une main, périmée, en cours), attendre. */
export type GesteDuPassage = 'deposer' | 'prevenue' | 'reprendre' | 'attendre';
export function gesteDuPassage(ligne: { statut?: string; quand?: string } | null | undefined, hierIso: string): GesteDuPassage {
  if (!ligne) return 'deposer';
  if (ligne.statut === 'envoyé') return 'prevenue';
  if (ligne.statut === 'échec' && (ligne.quand ?? '') < hierIso) return 'reprendre';
  return 'attendre';
}

export type BilanDuPassage = { envoyes: number; deposes: number; refus: number; sansNumero: number; verrouilles: number };

/** UN PASSAGE : juge, verrouille, envoie, consigne. Ne lance jamais rien
    hors des heures du salon, ni sans connexion. */
export async function previensLesFinsDePaquet(o: { branchId: string }): Promise<BilanDuPassage> {
  const bilan: BilanDuPassage = { envoyes: 0, deposes: 0, refus: 0, sansNumero: 0, verrouilles: 0 };
  if (!supabase || !estLHeureDEcrire()) return bilan;
  const sb = supabase;
  const aujourdhui = jourLocal();
  const subs = subscribersStore.get().filter((s) => s.branchId === o.branchId);
  if (subs.length === 0) return bilan;
  const comptes = comptesAbonnement({
    subs, plans: plansStore.get(), appts: appointmentsStore.get(), aujourdhui, invoices: invoicesStore.get(),
  });
  const alertes = paquetsEnFin(comptes.flatMap((c) => c.contrats), aujourdhui).filter((f) => !f.sub.finPrevenueLe);
  if (alertes.length === 0) return bilan;
  const clients = clientsStore.get();

  /* Les lignes déjà posées à leur nom, et le facteur : vivant, on dépose. */
  const { data: posees } = await sb.from('envois').select('id, data').in('id', alertes.map((f) => idDuVerrou(f.sub.id)));
  const ligneDe = new Map(((posees ?? []) as { id: string; data: { statut?: string; quand?: string } }[]).map((l) => [l.id, l.data]));
  const { data: facteur } = await sb.from('documents').select('data').eq('key', 'mnd_facteur').maybeSingle();
  const parLaSalle = facteurVivant((facteur?.data as { vuLe?: string } | null)?.vuLe, Date.now());
  const hier = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const f of alertes) {
    const id = idDuVerrou(f.sub.id);
    const ligne = ligneDe.get(id);
    const geste = gesteDuPassage(ligne, hier);
    /* PARTIE PAR LE FACTEUR : le contrat se dit prévenu, au jour de l'envoi. */
    if (geste === 'prevenue') {
      const le = ligne?.quand ?? new Date().toISOString();
      subscribersStore.set((prev) => prev.map((s) => (s.id === f.sub.id ? { ...s, finPrevenueLe: le } : s)));
      bilan.envoyes += 1;
      continue;
    }
    if (geste === 'attendre') { bilan.verrouilles += 1; continue; }
    const fiche = clients.find((c) => c.id === f.clientId);
    const numero = numeroWa(fiche?.phone) || numeroWa(fiche?.phone2);
    if (!numero) { bilan.sansNumero += 1; continue; }

    const quand = new Date().toISOString();
    const socle = {
      id, branchId: o.branchId, type: 'fin-de-paquet', canal: 'whatsapp',
      clientId: f.clientId, subId: f.sub.id, motif: f.motif, reste: f.reste, jusquau: f.jusquau,
      prenom: (fiche?.name ?? f.nom ?? '').trim().split(/\s+/)[0] ?? '',
    };

    /* ── PAR LA SALLE D'ATTENTE : déposé, le facteur le porte ────────── */
    if (parLaSalle) {
      const depart = heureDeDepart(Date.now(), REGLES_PAR_DEFAUT);
      const enSalle = {
        ...socle, statut: EN_ATTENTE, quand, deposeLe: quand,
        partA: new Date(depart.partA).toISOString(), calme: depart.calme,
        colis: colisDeLaFinDePaquet(f, fiche, numero),
      };
      /* Une insertion, un seul gagnant ; un échec d'avant-hier se redépose
         par une mise à jour qui ne réussit qu'à un seul poste. */
      const { data: pose } = geste === 'deposer'
        ? await sb.from('envois').insert({ id, branch_id: o.branchId, data: enSalle }).select('id')
        : await sb.from('envois').update({ data: { ...enSalle, reprise: true }, updated_at: quand })
          .eq('id', id).eq('data->>statut', 'échec').lt('data->>quand', hier).select('id');
      if ((pose ?? []).length) bilan.deposes += 1; else bilan.verrouilles += 1;
      continue;
    }

    /* ── FACTEUR MUET : comme avant, tout de suite ──────────────────── */
    /* ① LE VERROU : une insertion, un seul gagnant. */
    const { data: verrou } = geste === 'deposer'
      ? await sb.from('envois').insert({ id, branch_id: o.branchId, data: { ...socle, statut: 'en cours', quand } }).select('id')
      : await sb.from('envois').update({ data: { ...socle, statut: 'en cours', quand, reprise: true }, updated_at: quand })
        .eq('id', id).eq('data->>statut', 'échec').lt('data->>quand', hier).select('id');
    if (!(verrou ?? []).length) { bilan.verrouilles += 1; continue; }

    /* ② L'ENVOI, par la porte qui existe. */
    const r = await envoieSurWhatsApp({
      numero,
      modele: MODELE_FIN_DE_PAQUET,
      variables: variablesDeLaFinDePaquet(f, fiche),
      /* Le fil garde les mots qu'elle lit, pas le nom du modèle. */
      texte: phraseDeLaFinDePaquet(f, fiche),
      clientId: f.clientId,
      branchId: o.branchId,
      parQui: 'la Maison, automatiquement',
    });

    /* ③ LE VERDICT, consigné même raté. */
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
