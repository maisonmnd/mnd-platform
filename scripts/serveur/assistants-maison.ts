/* ══ LA SOURCE DE LA FONCTION « assistants-maison », 31 octobre 2026 ══════
   Ce fichier n'est PAS déployé tel quel : `node scripts/assistants-maison-serveur.mjs`
   le regroupe avec le module pur (`shared/assistants-pur`, `shared/civilite`,
   `shared/salle-des-envois`) dans `supabase/functions/assistants-maison/index.ts`,
   le fichier entier qui part (`node scripts/mise-en-ligne.mjs fonction
   assistants-maison --jwt non`).

   QUI L'APPELLE : les assistants reliés de la Maison (Opale sur l'ordinateur
   de Yéman, Onyx sur le Mac de Brice), par la ligne de commande
   `scripts/assistant-maison.mjs`, avec leur jeton d'appareil (porte A :
   en-tête x-jeton-assistant, la base ne garde que l'empreinte, table
   `assistants`) ; et l'écran « Les assistants » du Trône, avec la session
   d'un souverain (porte B : Authorization Bearer, `staff.role = 'souverain'`).
   Une action de la porte A refuse la porte B, et inversement.

   CE QU'ELLE FAIT : le passage (l'état de l'assistant, ses relais, ses
   décisions tranchées, l'état de l'autre, et depuis le 2 novembre 2026 la
   veille bâtie sur les réglages : ses tâches cron, l'heure qui en est ou
   non), les relais entre assistants (un
   seul champ libre, passé au filtre des faits), les décisions laissées au
   porteur, et les rendez-vous : jamais à la souris, toujours ici, sous une
   prise (une pose par cliente et par jour, tous assistants confondus), une
   clé d'idempotence par geste, le verrou `pose_si_libre` quand ses bornes
   tiennent, un verrou optimiste sur `updated_at` pour toute modification.
   Elle écrit elle-même sa ligne au journal des gestes (porte 'assistant',
   parNom = le nom de l'assistant, lu dans la table par l'empreinte : jamais
   dans le corps de la requête). Les notifications au porteur partent par
   push-notify (mode `to-staff`), sans nom ni extrait.

   LA CONFIRMATION OFFICIELLE d'un rendez-vous posé « confirmé » part déjà
   par `confirmation-rdv` (voir `rdvPoser`) ; celle d'une place tenue part
   d'ici au toucher « Confirmer » (voir `deposeLaConfirmationOfficielle`).

   LE SOCLE DE LA MAISON INTELLIGENTE (2 novembre 2026) : les cartes de tous
   les genres (rendez-vous, dépense, publication, planning, accès, en plus des
   cinq d'Opale), avec leurs `faits` ; le mode « Je suis loin » (`loin.basculer`,
   le bouton du porteur) : la carte peut alors porter le nom du contact et son
   message (`prive`), pour le porteur seul, effacés dès la décision ; une seule
   notification par tour, avec le nombre de cartes, de 7 h à 22 h ; la carte
   d'une dépense, validée d'un toucher, pose ici la dépense DÉJÀ VALIDÉE au nom
   du porteur ; et le bilan du matin (`bilan.deposer`), lu par Saphir.

   UNE CONSIGNE AUX ASSISTANTS (5 novembre 2026, lot 1) : la direction écrit
   à l'assistant de son choix (table `assistants_consignes`, 0162) ;
   `consigne.lire` les rend à l'assistant qui appelle (et, avec `marquer:
   false`, les montre au guetteur du PC sans rien marquer), `consigne.repondre`
   dit ce qui est fait, ce qui attend un oui (la seule notification), ce qui
   attend ; `consigne.passer` la donne à l'assistant concerné. Les gestes faits
   seuls (rdv.poser, rdv.deplacer, rdv.annuler, note.poser) rendent leur
   `defaire`, que l'assistant recopie dans sa réponse.

   AUCUN SECRET ICI : SUPABASE_URL et CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement ; WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE_CONF
   seulement pour savoir si la pièce WhatsApp se dépose. GET sans clé : la
   version et le nombre d'assistants. Le jeton rendu par `jeton.donner` n'est
   jamais journalisé. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ACTIONS_DU_JETON, CHOIX_AVEC_TEXTE, CHOIX_PAR_GENRE, EN_TETE_DU_JETON_ASSISTANT, GENRES_AVEC_FAITS, PORTE_ASSISTANT, RELAIS_DIT, RELAIS_QUI_DEMANDE_UN_GESTE,
  aCotonou, bilanEstPropre, corpsDeNotification, cleDeJour, cronsDeLaVeille, dansLaVeille, echeanceOuvree, empecheDit, empreinteDuJetonAssistant,
  estGenreDeDecision, estGenreDeRelais, estUneTresse, etatDe, faitsDeLaCarte, heureDite, modeDe, motEstPropre, motsDe, noteEstPropre,
  notificationPermise, nouveauJetonAssistant, numeroCle as cleDuNumero, porteDeLAction, priveEstPropre, reglagesComplets, relaisPerime,
  resumeEstPropre, rythmeA, seuilDeSommeilMin, tournureInterdite, vocabulairePermis,
  type Assistant, type ChoixDeDecision, type Controles, type Decision, type FaitsDeDepense, type GenreDeDecision, type GenreDeRelais,
  type ReglagesAssistants, type Relais,
} from '../../src/shared/assistants-pur';
import { passeAuTrone, professionnel } from '../../src/shared/maison-intelligente-pur';
import { appelDe } from '../../src/shared/civilite';
import { heureDeDepart, reglesDepuis } from '../../src/shared/salle-des-envois';
import { NOM_DU_SECRET_DES_LIENS, composantsDeLaConfirmation, jetonDuRendezVous, referenceDuRendezVous, texteDeLaConfirmation } from '../../src/shared/lien-du-rdv-pur';
import {
  COMPARTIMENT_DES_RECUS, caisseDeLaDepense, categorieConnue, cheminDuRecu, doublonDeLaDepense, idDeLaDepense, libelleDeLaDepense,
  lisLaDemandeDeDepense, lisLeRecu, pieceDuJournal, porteurConnu, prestataireNomme, saisiePar, type DemandeLue, type DepenseExistante,
} from '../../src/shared/assistants-depenses-pur';
import {
  FICHES_AU_PLUS, LECTURES_PAR_JOUR, ficheCorrespond, ficheLisible, lisLaRecherche, motifDeLaBase, pieceDeLaLecture,
} from '../../src/shared/assistants-fiches-pur';
import {
  CONSIGNES_LUES_AU_PLUS, DEFAIRE_PENDANT_MS, MOT_DE_PASSE_AU_PLUS, STATUTS_A_LIRE, STATUTS_NOUVEAUX, defaireDeLAnnulation, defaireDeLaNote, defaireDeLaPose,
  defaireDuDeplacement, estNouvelle, notificationDuOui, peutPasser, reponseDeConsigne,
} from '../../src/shared/consignes-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

/* 2 novembre 2026 : la veille suit les réglages (rythme du jour et du soir) ;
   le seuil du sommeil n'est plus une constante, le passage rend ses crons.
   Puis, le même jour, le socle de la Maison intelligente. */
const VERSION = '2026-11-05-a · une consigne aux assistants : consigne.lire, consigne.repondre, consigne.passer ; défaire rendu par les gestes faits seuls';
/** La maison phare, quand l'assistant n'a pas de branche et que la table n'en dit pas. */
const BRANCHE_PHARE = 'br-40r6u6frno';
const ECRAN = 'Les assistants';
const ADRESSE_DES_ASSISTANTS = '/trone/#/assistants';
const ETIQUETTE_DES_NOTIFICATIONS = 'mnd-assistants';
const ETIQUETTE_DES_CONSIGNES = 'mnd-consignes';
/** Un appel à push-notify ne pend jamais au-delà. */
const ENVOI_MAX_MS = 8_000;
/** La fenêtre de `pose_si_libre` (0140) : de demain à quatre-vingt-dix jours, comptés à Cotonou. */
const FENETRE_DU_VERROU_JOURS = 90;
const TZ = 'Africa/Porto-Novo';
/** « Je suis loin » : une notification par tour. Le rythme le plus court est
    de cinq minutes ; deux passages à moins de quatre minutes sont le même tour. */
const UN_TOUR_AU_MOINS_MS = 4 * 60_000;
/** Le bilan du matin se dépose pour un jour de la semaine écoulée, jamais pour demain. */
const JOURS_DU_BILAN = 7;

// deno-lint-ignore no-explicit-any
type Base = any;
type Ligne = { id?: string; key?: string; data?: Record<string, unknown> | null };
type LigneAssistant = {
  id: string; nom: string; porteur_team_id?: string | null; porteur_user_id?: string | null; appareil?: string | null;
  empreinte?: string | null; jeton_pose_le?: string | null; vu_le?: string | null; eveille_depuis?: string | null;
  etat?: Record<string, unknown> | null; branch_id?: string | null;
  loin_depuis?: string | null; loin_par?: string | null;
};
type LigneRelais = {
  id: string; de: string; pour: string; genre: string; numero_cle?: string | null; client_id?: string | null; rdv_id?: string | null;
  mot?: string | null; quand: string; perime_le?: string | null; lu_le?: string | null; traite_le?: string | null; branch_id?: string | null;
};
type LigneDecision = {
  id: string; assistant: string; genre: string; numero_cle?: string | null; client_id?: string | null; rdv_id?: string | null;
  resume: string; proposition?: string | null; choix: unknown; echeance?: string | null; tranchee?: string | null; tranchee_le?: string | null;
  tranchee_par?: string | null; texte_modifie?: string | null; executee_le?: string | null; branch_id?: string | null; cree_le: string;
  faits?: Record<string, unknown> | null; prive?: unknown; prive_efface_le?: string | null;
};
/** Le rendez-vous tel qu'il vit dans `appointments.data` (forme de `Appointment`,
    plus les champs des assistants, en attendant qu'`agenda.ts` les nomme). */
type Rdv = {
  id: string; branchId: string; clientId: string; clientName?: string; serviceIds: string[]; date: string; time: string;
  master: string; status: string; source?: string; poseePar?: string; pourMaitre?: string; numeroAPrevenir?: string;
  sansConfirmation?: boolean; creeLe?: string; dureeMin?: number; note?: string;
  tenue?: { jusqua: string; par: string; pour?: string; confirmeeLe?: string; refuseeLe?: string };
  [k: string]: unknown;
};
/** Une consigne de la direction (0162), telle que la table la garde. */
type LigneConsigne = {
  id: string; de: string; de_user_id?: string | null; pour: string; texte: string; statut: string; reponse?: string | null;
  defaire?: unknown; decision_id?: string | null; ecrite_le: string; lue_le?: string | null; faite_le?: string | null;
  passee_de?: string | null; passee_le?: string | null; passee_mot?: string | null; notifie_le?: string | null;
  defaite_le?: string | null; defaite_par?: string | null; branch_id?: string | null;
};
type Fiche = { id: string; name?: string; prenom?: string; phone?: string; phone2?: string; civilite?: string; auMasculin?: boolean; branchId?: string };
type Souverain = { userId: string; nom: string };
type Porte = { genre: 'jeton'; moi: LigneAssistant } | { genre: 'souverain'; qui: Souverain };
type Corps = Record<string, unknown>;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${EN_TETE_DU_JETON_ASSISTANT}`,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const refus = (motif: string, status = 400, plus: Corps = {}) => json({ ok: false, motif, version: VERSION, ...plus }, status);
const rendu = (plus: Corps = {}) => json({ ok: true, version: VERSION, ...plus });
/** Le journal des fonctions ne porte jamais un jeton, un nom ni un extrait. */
const dis = (quoi: string, o: Record<string, unknown> = {}) => console.log(`assistants-maison · ${quoi} · ${JSON.stringify(o)}`);

const chaine = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nombre = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const estDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const heureNette = (v: unknown): string | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(chaine(v));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};
const identifiant = (prefixe: string) => `${prefixe}-${globalThis.crypto.randomUUID()}`;
const lignesDe = (rows: Ligne[] | null | undefined): Record<string, unknown>[] => (rows ?? []).map((r) => ({ id: r.id, ...(r.data ?? {}) }));
const plusTard = (ms: number, minutes: number) => new Date(ms + minutes * 60_000).toISOString();
const dateCotonouDans = (ms: number, jours: number): string => aCotonou(ms + jours * 86_400_000).dateISO;

/** RECOPIÉ de `src/shared/branches.ts` (`maitreParDefaut`) : ce module lit le
    magasin du poste, une fonction ne l'embarque pas. Le maître désigné s'il
    est toujours au tableau, sinon le premier de la liste. */
const maitreParDefaut = (b: { masters?: unknown; masterParDefaut?: unknown }): string => {
  const masters = Array.isArray(b.masters) ? b.masters.filter((m): m is string => typeof m === 'string') : [];
  const voulu = chaine(b.masterParDefaut);
  if (voulu && masters.includes(voulu)) return voulu;
  return masters[0] ?? '';
};

/* RECOPIÉ de la fonction confirmation-rdv (la même pièce, mot pour mot) : le
   numéro pour Meta, l'heure et le jour tels qu'on les dit. */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
const heureLisible = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0 ? `${Number(h)} h ${String(minutes).padStart(2, '0')}` : `${Number(h)} h`;
};
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  } catch { return iso; }
};
const jourCourt = (ms: number): string => {
  try {
    return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  } catch { return aCotonou(ms).dateISO; }
};

/* ── Les lignes de la base, mises à la forme du module pur ────────────── */

const assistantDe = (l: LigneAssistant): Assistant => ({
  id: l.id, nom: l.nom, porteurTeamId: l.porteur_team_id ?? null, porteurUserId: l.porteur_user_id ?? null, appareil: l.appareil ?? null,
  aUnJeton: !!l.empreinte, vuLe: l.vu_le ?? null, eveilleDepuis: l.eveille_depuis ?? null, etat: (l.etat ?? {}) as Assistant['etat'],
  loinDepuis: l.loin_depuis ?? null,
});
const relaisDe = (l: LigneRelais): Relais => ({
  id: l.id, de: l.de, pour: l.pour, genre: l.genre as GenreDeRelais, numeroCle: l.numero_cle ?? null, clientId: l.client_id ?? null,
  rdvId: l.rdv_id ?? null, mot: l.mot ?? null, quand: l.quand, perimeLe: l.perime_le ?? null, luLe: l.lu_le ?? null, traiteLe: l.traite_le ?? null,
});
const decisionDe = (l: LigneDecision): Decision => ({
  id: l.id, assistant: l.assistant, genre: l.genre as GenreDeDecision, numeroCle: l.numero_cle ?? null, clientId: l.client_id ?? null,
  rdvId: l.rdv_id ?? null, resume: l.resume, proposition: l.proposition ?? null,
  choix: (Array.isArray(l.choix) ? l.choix : []) as ChoixDeDecision[], echeance: l.echeance ?? null,
  tranchee: (l.tranchee ?? null) as ChoixDeDecision | null, trancheeLe: l.tranchee_le ?? null, trancheePar: l.tranchee_par ?? null,
  texteModifie: l.texte_modifie ?? null, executeeLe: l.executee_le ?? null, creeLe: l.cree_le,
  /* Les faits, pour que l'assistant exécute la carte ; JAMAIS `prive` : le
     nom et le message sont au porteur seul, à l'écran, pas à la machine. */
  faits: (l.faits ?? null) as Decision['faits'],
});
/** Le privé d'une carte s'efface dans la même écriture que sa décision. */
const effaceLePrive = (dec: LigneDecision, maintenant: string): Corps =>
  ({ prive: null, ...(dec.prive != null ? { prive_efface_le: maintenant } : {}) });

/* ── Le serveur ───────────────────────────────────────────────────────── */

class Serveur {
  constructor(readonly sb: Base, readonly url: string, readonly service: string) {}

  /* Les lectures. */
  async assistants(): Promise<LigneAssistant[]> {
    const { data } = await this.sb.from('assistants').select('*').limit(100);
    return (data ?? []) as LigneAssistant[];
  }
  async assistant(id: string): Promise<LigneAssistant | null> {
    const { data } = await this.sb.from('assistants').select('*').eq('id', id).maybeSingle();
    return (data ?? null) as LigneAssistant | null;
  }
  async reglages(): Promise<Required<ReglagesAssistants>> {
    const { data } = await this.sb.from('documents').select('data').eq('key', 'mnd_settings').maybeSingle();
    return reglagesComplets(((data?.data as { assistants?: ReglagesAssistants } | null)?.assistants) ?? null);
  }
  async brancheVedette(): Promise<{ id: string; masters?: unknown; masterParDefaut?: unknown } | null> {
    const { data } = await this.sb.from('branches').select('id, data').limit(100);
    const lignes = lignesDe(data as Ligne[] | null) as { id: string; flagship?: unknown; status?: unknown; masters?: unknown; masterParDefaut?: unknown }[];
    return lignes.find((b) => b.flagship === true || b.flagship === 'true')
      ?? lignes.find((b) => (b.status ?? 'active') === 'active') ?? lignes[0] ?? null;
  }
  async catalogue(): Promise<{ noms: string[]; prestations: { id: string; name: string; categoryId?: string }[]; rubriques: { id: string; label: string }[] }> {
    const [services, categories] = await Promise.all([
      this.sb.from('catalog_services').select('id, data').limit(1000).then((r: { data?: Ligne[] | null }) => lignesDe(r.data)).catch(() => []),
      this.sb.from('catalog_categories').select('id, data').limit(1000).then((r: { data?: Ligne[] | null }) => lignesDe(r.data)).catch(() => []),
    ]);
    const prestations = (services as Record<string, unknown>[]).map((s) => ({ id: String(s.id), name: chaine(s.name), categoryId: chaine(s.categoryId) || undefined }));
    const rubriques = (categories as Record<string, unknown>[]).map((c) => ({ id: String(c.id), label: chaine(c.label) || chaine(c.name) }));
    const noms = [...prestations.map((p) => p.name), ...(categories as Record<string, unknown>[]).flatMap((c) => [chaine(c.label), chaine(c.fon), chaine(c.name)])].filter(Boolean);
    return { noms, prestations, rubriques };
  }
  async ficheParId(id: string): Promise<Fiche | null> {
    const { data } = await this.sb.from('clients').select('id, data').eq('id', id).maybeSingle();
    if (!data) return null;
    const d = (data.data ?? {}) as Record<string, unknown>;
    return {
      id: String(data.id), name: chaine(d.name) || undefined, prenom: chaine(d.prenom) || undefined, phone: chaine(d.phone) || undefined,
      phone2: chaine(d.phone2) || undefined, civilite: chaine(d.civilite) || undefined, auMasculin: d.auMasculin === true, branchId: chaine(d.branchId) || undefined,
    };
  }
  /** Les fiches d'un numéro, par la base (0125, service seule) : `phone` et `phone2`, puis la famille. */
  async fichesDuNumero(numero: string): Promise<{ id: string; nom: string; parPhone?: boolean; parFamille?: boolean; branchId?: string; numeros?: string[] }[]> {
    const { data, error } = await this.sb.rpc('fiches_du_numero', { n: numero });
    if (error || !Array.isArray(data)) return [];
    return data as { id: string; nom: string; parPhone?: boolean; parFamille?: boolean; branchId?: string; numeros?: string[] }[];
  }
  async rdv(id: string): Promise<{ id: string; branch_id: string | null; data: Rdv; updated_at: string } | null> {
    const { data } = await this.sb.from('appointments').select('id, branch_id, data, updated_at').eq('id', id).maybeSingle();
    return (data ?? null) as { id: string; branch_id: string | null; data: Rdv; updated_at: string } | null;
  }
  async rdvAVenir(clientId: string, aujourdhui: string): Promise<Rdv | null> {
    const { data } = await this.sb.from('appointments').select('id, data')
      .eq('data->>clientId', clientId).gte('data->>date', aujourdhui).neq('data->>status', 'annulé')
      .order('data->>date', { ascending: true }).limit(20);
    const lignes = ((data ?? []) as { id: string; data: Rdv }[]).map((r) => ({ ...r.data, id: r.id }));
    lignes.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return lignes[0] ?? null;
  }

  /* Les écritures communes. */
  async journalise(parNom: string, g: { verbe: 'pose' | 'modifie' | 'efface' | 'lit'; table: string; pieceId: string; piece: string; branchId?: string | null; champs?: { champ: string; avant?: string; apres?: string }[] }): Promise<void> {
    const id = identifiant('geste');
    const geste = {
      id, ...(g.branchId ? { branchId: g.branchId } : {}), quand: new Date().toISOString(), parNom, porte: PORTE_ASSISTANT,
      verbe: g.verbe, table: g.table, ecran: ECRAN, pieceId: g.pieceId, piece: g.piece, ...(g.champs?.length ? { champs: g.champs } : {}),
    };
    try { await this.sb.from('journal_gestes').insert({ id, branch_id: g.branchId ?? null, data: geste }); } catch { /* une trace manquée n'arrête pas le geste */ }
  }

  /** La notification au porteur d'un assistant, par push-notify (mode to-staff) : jamais un nom, jamais un extrait. */
  async notifieLePorteur(a: LigneAssistant | null, genre: Parameters<typeof corpsDeNotification>[0], detail?: Parameters<typeof corpsDeNotification>[1]): Promise<{ sent: number; motif?: string }> {
    if (!a) return { sent: 0, motif: 'assistant-inconnu' };
    if (!a.porteur_user_id) return { sent: 0, motif: 'porteur-sans-compte' };
    const { titre, corps } = corpsDeNotification(genre, detail);
    try {
      const r = await fetch(`${this.url}/functions/v1/push-notify`, {
        method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.service}` },
        body: JSON.stringify({ mode: 'to-staff', userId: a.porteur_user_id, title: titre, body: corps, url: ADRESSE_DES_ASSISTANTS, tag: ETIQUETTE_DES_NOTIFICATIONS }),
      });
      const lu = (await r.json().catch(() => ({}))) as { sent?: number };
      return { sent: Number(lu.sent ?? 0) || 0 };
    } catch (e) {
      dis('notification en échec', { genre, motif: String((e as Error)?.message ?? e).slice(0, 80) });
      return { sent: 0, motif: 'push-notify' };
    }
  }

  /** Une notification à un compte de la direction, par push-notify (mode
      to-staff) : un titre et un corps déjà propres (sans nom, sans extrait). */
  async notifieLeCompte(userId: string | null | undefined, titre: string, corps: string, etiquette = ETIQUETTE_DES_NOTIFICATIONS): Promise<number> {
    if (!userId) return 0;
    try {
      const r = await fetch(`${this.url}/functions/v1/push-notify`, {
        method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.service}` },
        body: JSON.stringify({ mode: 'to-staff', userId, title: titre, body: corps, url: ADRESSE_DES_ASSISTANTS, tag: etiquette }),
      });
      const lu = (await r.json().catch(() => ({}))) as { sent?: number };
      return Number(lu.sent ?? 0) || 0;
    } catch (e) {
      dis('notification en échec', { genre: etiquette, motif: String((e as Error)?.message ?? e).slice(0, 80) });
      return 0;
    }
  }

  /** Un relais déposé par la fonction : la ligne, la notification si le genre
      demande un geste, la ligne de journal. Le `mot` a déjà passé le filtre. */
  async deposeUnRelais(de: LigneAssistant, r: { pour: LigneAssistant; genre: GenreDeRelais; numeroCle?: string | null; clientId?: string | null; rdvId?: string | null; mot?: string | null; perimeLe?: string | null; heure?: string }): Promise<{ id: string; sent: number }> {
    const id = identifiant('relais');
    const quand = new Date().toISOString();
    await this.sb.from('assistants_relais').insert({
      id, de: de.id, pour: r.pour.id, genre: r.genre, numero_cle: r.numeroCle ?? null, client_id: r.clientId ?? null, rdv_id: r.rdvId ?? null,
      mot: r.mot ?? null, quand, perime_le: r.perimeLe ?? null, branch_id: de.branch_id ?? null,
    });
    let sent = 0;
    if (RELAIS_QUI_DEMANDE_UN_GESTE.includes(r.genre)) sent = (await this.notifieLePorteur(r.pour, r.genre, r.heure ? { heure: r.heure } : undefined)).sent;
    await this.journalise(de.nom, { verbe: 'pose', table: 'assistants_relais', pieceId: id, piece: `Relais : ${RELAIS_DIT[r.genre]}`, branchId: de.branch_id });
    return { id, sent };
  }

  /** L'autre assistant : celui dont le porteur tient ce maître. */
  async assistantDuMaitre(pourMaitre: string, saufId: string): Promise<LigneAssistant | null> {
    if (!pourMaitre) return null;
    return (await this.assistants()).find((a) => a.id !== saufId && a.porteur_team_id === pourMaitre) ?? null;
  }

  /** LA CONFIRMATION OFFICIELLE D'UNE PLACE TENUE (modèle Meta de la Maison).
      Un rendez-vous posé « confirmé » n'a pas besoin d'elle : la base signe sa
      pose (trace 0092, `operation = 'pose'`, à l'instant de l'insert, que
      l'insert vienne de `pose_si_libre` ou de la clé service), et
      `confirmation-rdv` balaie toutes les dix minutes ce qui est confirmé,
      non annulé, à venir, posé depuis moins de deux heures et sans
      `sansConfirmation` : il part de lui-même, push et modèle, par la salle
      des envois. Une place tenue, elle, naît « en attente » avec
      `sansConfirmation: true`, et peut n'être confirmée que le lendemain
      matin : `confirmationEstNeuve` la tiendrait pour ancienne (la pose date
      de plus de deux heures) et rien ne partirait. On dépose donc ici LA MÊME
      PIÈCE que `confirmation-rdv` : `conf-<rdv>-push` et, si les clés Meta
      sont posées, `conf-<rdv>-whatsapp`, statut « en-attente », mêmes colis,
      mêmes identifiants ; le facteur `envois-partent` les porte à l'heure de
      la salle, et `confirmation-rdv`, s'il repasse dans la fenêtre, voit ces
      lignes et ne double rien. `ignoreDuplicates` : une ligne déjà là reste. */
  async deposeLaConfirmationOfficielle(rdv: Rdv, maintenantMs: number): Promise<number> {
    const fiche = await this.ficheParId(rdv.clientId);
    const { data: docs } = await this.sb.from('documents').select('key, data').in('key', ['mnd_house_identity', 'mnd_auto_config']);
    const lus = (docs ?? []) as { key: string; data?: Record<string, unknown> | null }[];
    const nomMaison = chaine(lus.find((d) => d.key === 'mnd_house_identity')?.data?.nom) || 'Maison MND';
    const cfg = (lus.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as { itineraire?: unknown; salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown };
    const regles = reglesDepuis(cfg);
    const prenom = appelDe(fiche as Parameters<typeof appelDe>[0], rdv.clientName);
    const quand = `${jourEnClair(rdv.date)} à ${heureLisible(rdv.time)}`;
    const { partA, calme } = heureDeDepart(maintenantMs, regles);
    const socle = (canal: string, colis: Record<string, unknown>) => ({
      id: `conf-${rdv.id}-${canal}`, branch_id: rdv.branchId ?? null,
      data: {
        id: `conf-${rdv.id}-${canal}`, branchId: rdv.branchId, type: 'confirmation', canal, apptId: rdv.id, clientId: rdv.clientId,
        dateRdv: rdv.date, heure: rdv.time, statut: 'en-attente', quand: new Date(maintenantMs).toISOString(),
        deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(), ...(calme ? { calme: true } : {}), prenom, colis,
        deposePar: 'assistants-maison',
      },
    });
    const lignes = [socle('push', {
      genre: 'push', clientId: rdv.clientId, titre: `${nomMaison} · c'est confirmé`,
      corps: `${prenom}, votre rendez-vous est retenu ${quand}. ${chaine(cfg.itineraire)}`.trim(), url: '/couronne/',
    })];
    const tel = numeroIntl(chaine(rdv.numeroAPrevenir) || fiche?.phone);
    if (Deno.env.get('WA_TOKEN') && Deno.env.get('WA_PHONE_ID') && tel) {
      /* LA CONFIRMATION À LIENS (3 novembre 2026), la même pièce que
         `confirmation-rdv` : la référence et les deux boutons quand le modèle
         neuf est posé, l'ancien en repli dans le colis. */
      const modele = Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv';
      const liens = (Deno.env.get('WA_TEMPLATE_CONF_LIENS') ?? '').trim();
      const secret = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();
      const reference = referenceDuRendezVous(rdv.id);
      const jeton = liens && secret ? await jetonDuRendezVous(secret, rdv.id).catch(() => '') : '';
      const sansLiens = { modele, composants: composantsDeLaConfirmation({ avecLiens: false, prenom, quand, reference, jeton }), texteAuFil: texteDeLaConfirmation({ avecLiens: false, prenom, quand, reference }) };
      lignes.push(socle('whatsapp', jeton ? {
        genre: 'whatsapp', numero: tel, modele: liens, parQui: 'Le Trône',
        texteAuFil: texteDeLaConfirmation({ avecLiens: true, prenom, quand, reference }),
        composants: composantsDeLaConfirmation({ avecLiens: true, prenom, quand, reference, jeton }),
        repli: sansLiens,
      } : { genre: 'whatsapp', numero: tel, parQui: 'Le Trône', ...sansLiens }));
    }
    const { error } = await this.sb.from('envois').upsert(lignes, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { dis('confirmation non déposée', { motif: String(error.message ?? '').slice(0, 80) }); return 0; }
    return lignes.length;
  }
}

/* ── Les actions de la porte A (le jeton d'un assistant) ─────────────── */

async function passage(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const c = (d.controles ?? {}) as Partial<Controles>;
  const controles: Controles = { chrome: c.chrome !== false, lie: c.lie !== false, nonLus: c.nonLus !== false };
  const precedentVuLe = moi.vu_le ?? null;
  const precedent = Date.parse(precedentVuLe ?? '');
  const reglages = await s.reglages();
  /* La série de passages tient si le précédent date de moins du seuil du
     rythme en vigueur depuis (25 minutes le jour, 45 le soir, par défaut) ;
     sinon, c'est un réveil. Une constante sous le rythme du soir faisait de
     chaque tour du soir un réveil, et un « empêché » redit à chaque tour. */
  const eveilleDepuis = Number.isFinite(precedent) && maintenantMs - precedent <= seuilDeSommeilMin(precedent, maintenantMs, reglages) * 60_000 && moi.eveille_depuis
    ? moi.eveille_depuis : maintenant;
  const etat: Record<string, unknown> = { ...(moi.etat ?? {}) };
  delete etat.dortPrevenuLe;
  etat.controles = controles;
  etat.empeche = empecheDit(controles);
  if (chaine(d.version)) etat.version = chaine(d.version).slice(0, 40);
  if (nombre(d.traites) !== undefined) etat.traites = Math.max(0, Math.round(nombre(d.traites) as number));
  let notifie = 0;
  if (etat.empeche) {
    const prevenu = Date.parse(chaine(etat.empechePrevenuLe));
    /* Prévenu une fois par empêchement : pas encore, ou avant ce réveil. */
    if (!(Number.isFinite(prevenu) && prevenu >= Date.parse(eveilleDepuis))) {
      notifie = (await s.notifieLePorteur(moi, 'empeche', { nom: moi.nom, empeche: String(etat.empeche) })).sent;
      etat.empechePrevenuLe = maintenant;
    }
  } else {
    delete etat.empechePrevenuLe;
  }
  /* « JE SUIS LOIN » (2 novembre 2026) : le porteur a touché le bouton ; les
     cartes nouvelles de ce tour partent en UNE notification, le nombre seul,
     jamais un nom, de 7 h à 22 h (heure de Cotonou) ; la nuit, elles attendent
     au Trône. Deux passages du même tour ne notifient qu'une fois. */
  const mode = modeDe(moi.loin_depuis);
  const cartesNouvelles = Math.max(0, Math.round(nombre(d.cartesNouvelles) ?? 0));
  let notifieCartes = 0;
  if (mode.loin && cartesNouvelles > 0 && notificationPermise(aCotonou(maintenantMs).heure)) {
    const dejaPrevenu = Date.parse(chaine(etat.cartesPrevenuLe));
    if (!(Number.isFinite(dejaPrevenu) && maintenantMs - dejaPrevenu < UN_TOUR_AU_MOINS_MS)) {
      notifieCartes = (await s.notifieLePorteur(moi, 'cartes', { n: cartesNouvelles, nom: moi.nom })).sent;
      etat.cartesPrevenuLe = maintenant;
    }
  }
  await s.sb.from('assistants').update({ vu_le: maintenant, eveille_depuis: eveilleDepuis, etat }).eq('id', moi.id);

  const [relaisLus, decisionsLues, tous] = await Promise.all([
    s.sb.from('assistants_relais').select('*').eq('pour', moi.id).is('traite_le', null).order('quand', { ascending: true }).limit(200),
    s.sb.from('assistants_decisions').select('*').eq('assistant', moi.id).not('tranchee', 'is', null).is('executee_le', null).order('cree_le', { ascending: true }).limit(200),
    s.assistants(),
  ]);
  const relais = ((relaisLus.data ?? []) as LigneRelais[]).map(relaisDe).filter((r) => !relaisPerime(r, maintenantMs));
  const decisions = ((decisionsLues.data ?? []) as LigneDecision[]).map(decisionDe);
  const autres = tous.filter((a) => a.id !== moi.id).map((a) => {
    const e = etatDe(assistantDe(a), maintenantMs, reglages);
    return { id: a.id, nom: a.nom, etat: e.etat, detail: e.detail, vuLe: a.vu_le ?? null };
  });
  /* La veille, bâtie sur les réglages : l'assistant pose ses tâches cron
     telles quelles (charte, section 3) et sait si cette heure en est. */
  const heure = aCotonou(maintenantMs).heure;
  const veille = { dansLaVeille: dansLaVeille(heure, reglages), rythmeMin: rythmeA(heure, reglages), crons: cronsDeLaVeille(reglages) };
  return rendu({ assistant: { id: moi.id, nom: moi.nom }, precedentVuLe, eveilleDepuis, empeche: etat.empeche ?? null, notifie, reglages, veille, mode, notifieCartes, relais, decisions, autres });
}

async function relaisDeposer(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const genre = d.genre;
  if (!estGenreDeRelais(genre)) return refus('genre-inconnu');
  const pourId = chaine(d.pour);
  if (!pourId || pourId === moi.id) return refus('pour-invalide');
  const pour = await s.assistant(pourId);
  if (!pour) return refus('assistant-inconnu', 404);
  const numero = cleDuNumero(chaine(d.numeroCle)) ?? null;
  const clientId = chaine(d.clientId) || null;
  const rdvId = chaine(d.rdvId) || null;
  const mot = chaine(d.mot);
  if (mot) {
    /* Le vocabulaire : les mots du relais, le catalogue, les prénoms de la fiche visée. */
    const [catalogue, fiche, fiches] = await Promise.all([
      s.catalogue(),
      clientId ? s.ficheParId(clientId) : Promise.resolve(null),
      !clientId && numero ? s.fichesDuNumero(numero) : Promise.resolve([]),
    ]);
    const prenoms = [...(fiche ? [fiche.name ?? '', fiche.prenom ?? ''] : []), ...fiches.map((f) => f.nom)].flatMap((n) => motsDe(n));
    const juge = motEstPropre(mot, vocabulairePermis(catalogue.noms, prenoms));
    if (!juge.ok) return refus('mot-refuse', 400, { detail: juge.motif });
  }
  const perimeDansMin = nombre(d.perimeDansMin);
  const { id, sent } = await s.deposeUnRelais(moi, {
    pour, genre, numeroCle: numero, clientId, rdvId, mot: mot || null,
    perimeLe: perimeDansMin && perimeDansMin > 0 ? plusTard(Date.now(), Math.min(perimeDansMin, 60 * 24 * 14)) : null,
  });
  return rendu({ id, sent });
}

async function relaisTraiter(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const id = chaine(d.id);
  if (!id) return refus('id');
  const { data } = await s.sb.from('assistants_relais').select('*').eq('id', id).maybeSingle();
  const r = (data ?? null) as LigneRelais | null;
  if (!r) return refus('relais-inconnu', 404);
  if (r.pour !== moi.id) return refus('pas-a-toi', 403);
  const maintenant = new Date().toISOString();
  await s.sb.from('assistants_relais').update({ traite_le: maintenant, lu_le: r.lu_le ?? maintenant }).eq('id', id);
  return rendu({ id });
}

async function decisionDeposer(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const genre = d.genre;
  if (!estGenreDeDecision(genre)) return refus('genre-inconnu');
  const resume = chaine(d.resume);
  const jugeResume = resumeEstPropre(resume);
  if (!jugeResume.ok) return refus('resume-refuse', 400, { detail: jugeResume.motif });
  const proposition = chaine(d.proposition) || null;
  const tournure = tournureInterdite(proposition);
  if (tournure) return refus('proposition-refusee', 400, { tournure });
  /* LES FAITS (2 novembre 2026) : ce que le Trône exécute, exigés pour un
     rendez-vous, une dépense, une publication, un planning, un accès. */
  const lusFaits = faitsDeLaCarte(genre, d.faits);
  if (!lusFaits.ok) return refus('faits-refuses', 400, { detail: lusFaits.motif });
  if (GENRES_AVEC_FAITS.includes(genre) && !lusFaits.faits) return refus('faits-refuses', 400, { detail: 'les faits de la carte' });
  let faits = (lusFaits.faits ?? null) as Corps | null;
  /* LE PRIVÉ : le nom du contact et son message, en mode loin seulement
     (choix 2 de « Je suis loin »). Le porteur là, le sélecteur suffit. */
  const mode = modeDe(moi.loin_depuis);
  let prive: { contact: string; message: string } | null = null;
  if (d.prive !== undefined && d.prive !== null) {
    if (!mode.loin) return refus('prive-hors-loin', 409, { detail: 'le nom et le message ne viennent au Trône qu en mode Je suis loin' });
    const p = priveEstPropre(d.prive);
    if (!p.ok) return refus('prive-refuse', 400, { detail: p.motif });
    prive = p.prive;
  }
  /* LA CARTE D'UNE DÉPENSE est contrôlée comme une dépense posée (prestataire,
     catégorie, caisse, porteur, doublon du jour), sans rien écrire : une
     carte qui arrive au porteur se valide d'un toucher. */
  if (genre === 'depense') {
    const f = faits as unknown as FaitsDeDepense;
    const autre = d.autre === true;
    const lue = lisLaDemandeDeDepense({ ...f, autre }, aCotonou(Date.now()).dateISO);
    if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
    const c = await controleLaDepense(s, moi, lue.v);
    if (!c.ok) return c.refus;
    faits = {
      ...f, categorie: c.categorie, caisse: c.caisse, ...(c.porteur ? { porteur: c.porteur } : {}), date: lue.v.date, ...(autre ? { autre: true } : {}),
    };
  }
  const echeanceMin = nombre(d.echeanceMin);
  const id = identifiant('decision');
  await s.sb.from('assistants_decisions').insert({
    id, assistant: moi.id, genre, numero_cle: cleDuNumero(chaine(d.numeroCle)) ?? null, client_id: chaine(d.clientId) || null, rdv_id: chaine(d.rdvId) || null,
    resume, proposition, choix: [...CHOIX_PAR_GENRE[genre]],
    echeance: echeanceMin && echeanceMin > 0 ? plusTard(Date.now(), Math.min(echeanceMin, 60 * 24 * 14)) : null, branch_id: moi.branch_id ?? null,
    faits, prive,
  });
  /* Loin, le tour notifie une fois pour toutes ses cartes (`passage`). */
  let sent = 0;
  if (d.notifier === true && !mode.loin) sent = (await s.notifieLePorteur(moi, 'decision', { nom: moi.nom })).sent;
  return rendu({ id, sent, ...(mode.loin ? { loin: true } : {}), ...(faits ? { faits } : {}) });
}

async function decisionExecutee(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const id = chaine(d.id);
  if (!id) return refus('id');
  const { data } = await s.sb.from('assistants_decisions').select('*').eq('id', id).maybeSingle();
  const dec = (data ?? null) as LigneDecision | null;
  if (!dec) return refus('decision-inconnue', 404);
  if (dec.assistant !== moi.id) return refus('pas-a-toi', 403);
  await s.sb.from('assistants_decisions').update({ executee_le: new Date().toISOString() }).eq('id', id);
  return rendu({ id });
}

async function rdvPoser(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const numero = cleDuNumero(chaine(d.numeroCle));
  if (!numero) return refus('numero-invalide');
  const serviceIds = Array.isArray(d.serviceIds) ? d.serviceIds.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [];
  if (serviceIds.length === 0) return refus('prestations');
  const date = d.date;
  if (!estDate(date)) return refus('date-invalide');
  const time = heureNette(d.time);
  if (!time) return refus('heure-invalide');
  const pourMaitre = chaine(d.pourMaitre);
  if (!pourMaitre) return refus('pour-maitre');
  const idempotence = chaine(d.idempotence);
  if (!idempotence) return refus('idempotence');
  const tenue = d.tenue === true;
  const ajouter = d.ajouter === true;

  /* ① LA FICHE : jamais créée par un assistant. Plusieurs têtes sous ce numéro
     (un parent, ses enfants) : il choisit, et redit `clientId`. */
  let fiche: Fiche | null = null;
  const clientId = chaine(d.clientId);
  if (clientId) fiche = await s.ficheParId(clientId);
  else {
    const fiches = await s.fichesDuNumero(numero);
    if (fiches.length > 1) return refus('plusieurs-fiches', 409, { fiches: fiches.map((f) => ({ id: f.id, nom: f.nom, parFamille: f.parFamille === true })) });
    if (fiches.length === 1) fiche = await s.ficheParId(fiches[0].id) ?? { id: fiches[0].id, name: fiches[0].nom, branchId: fiches[0].branchId };
  }
  if (!fiche) return refus('fiche-inconnue', 404);

  /* ② L'IDEMPOTENCE : un message rejoué après un redémarrage ne pose rien deux fois. */
  const cleGeste = `geste:${idempotence}`.slice(0, 200);
  const { data: priseGeste } = await s.sb.from('assistants_prises').upsert({ cle: cleGeste, assistant: moi.id, rdv_id: null, quand: maintenant }, { onConflict: 'cle', ignoreDuplicates: true }).select('cle');
  if (!priseGeste || priseGeste.length === 0) {
    const { data: deja } = await s.sb.from('assistants_prises').select('*').eq('cle', cleGeste).maybeSingle();
    const dejaLa = (deja ?? null) as { assistant: string; rdv_id?: string | null } | null;
    if (dejaLa?.rdv_id) return rendu({ verdict: 'deja', rdvId: dejaLa.rdv_id });
    /* Une prise sans rendez-vous : la pose d'avant n'a pas abouti, on la reprend. */
  }
  const libereLeGeste = async () => { try { await s.sb.from('assistants_prises').delete().eq('cle', cleGeste); } catch { /* rien */ } };

  /* ③ LA PRISE DU JOUR : une pose par cliente et par jour, tous assistants confondus. */
  const cleJour = cleDeJour(numero, date);
  const { data: priseJour } = await s.sb.from('assistants_prises').upsert({ cle: cleJour, assistant: moi.id, rdv_id: null, quand: maintenant }, { onConflict: 'cle', ignoreDuplicates: true }).select('cle');
  if (!priseJour || priseJour.length === 0) {
    const { data: tenueParRow } = await s.sb.from('assistants_prises').select('*').eq('cle', cleJour).maybeSingle();
    const tenuePar = (tenueParRow ?? null) as { assistant: string; quand: string } | null;
    if (tenuePar && tenuePar.assistant !== moi.id) {
      await libereLeGeste();
      const autre = await s.assistant(tenuePar.assistant);
      return refus('pris', 409, { par: autre?.nom ?? tenuePar.assistant, quand: tenuePar.quand });
    }
  }

  /* ④ UN RENDEZ-VOUS À VENIR DÉJÀ LÀ : le porteur tranche (déplacer, ajouter, rien). */
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  if (!ajouter) {
    const dejaUn = await s.rdvAVenir(fiche.id, aujourdhui);
    if (dejaUn) { await libereLeGeste(); return refus('deja-un-rdv', 409, { rdv: { id: dejaUn.id, date: dejaUn.date, time: dejaUn.time } }); }
  }

  /* ⑤ LE RENDEZ-VOUS. */
  const branche = await s.brancheVedette();
  const branchId = fiche.branchId || branche?.id || '';
  if (!branchId) { await libereLeGeste(); return refus('branche-inconnue', 500); }
  const master = chaine(d.master) || (branche ? maitreParDefaut(branche) : '');
  const reglages = await s.reglages();
  const autre = pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(pourMaitre, moi.id) : null;
  const rdvId = identifiant('rdv');
  const dureeMin = nombre(d.dureeMin);
  const note = chaine(d.note);
  const rdv: Rdv = {
    id: rdvId, branchId, clientId: fiche.id, ...(fiche.name ? { clientName: fiche.name } : {}), serviceIds, date, time, master,
    status: tenue ? 'en attente' : 'confirmé', source: 'assistant', poseePar: moi.nom, pourMaitre,
    ...(cleDuNumero(chaine(d.numeroAPrevenir)) ? { numeroAPrevenir: chaine(d.numeroAPrevenir) } : {}),
    sansConfirmation: tenue, creeLe: maintenant,
    ...(dureeMin && dureeMin > 0 ? { dureeMin: Math.round(dureeMin) } : {}),
    ...(note && noteEstPropre(note).ok ? { note } : {}),
    ...(tenue ? { tenue: { jusqua: echeanceOuvree(maintenantMs, reglages.tenueHeures), par: moi.id, ...(autre ? { pour: autre.id } : {}) } } : {}),
  };

  /* ⑥ LA POSE : sous le verrou de la base quand ses bornes tiennent (de demain à
     quatre-vingt-dix jours), sinon l'insert direct de la direction (la clé
     service passe le garde `une_place_en_ligne`). */
  const dansLaFenetre = date > aujourdhui && date <= dateCotonouDans(maintenantMs, FENETRE_DU_VERROU_JOURS);
  let masterPose = master;
  if (dansLaFenetre) {
    const { data: verdict, error } = await s.sb.rpc('pose_si_libre', { p_rdv: rdv, p_maitres: [master] });
    const v = (verdict ?? null) as { ok?: boolean; verdict?: string; id?: string; master?: string; raison?: string } | null;
    if (error || !v) { await libereLeGeste(); return refus('verrou', 500, { detail: String(error?.message ?? 'sans verdict').slice(0, 120) }); }
    if (!v.ok) { await libereLeGeste(); return refus(v.raison ?? 'creneau_pris'); }
    if (v.verdict === 'deja' || v.verdict === 'deja_pose') {
      await s.sb.from('assistants_prises').update({ rdv_id: v.id ?? rdvId }).eq('cle', cleGeste);
      return rendu({ verdict: 'deja', rdvId: v.id ?? rdvId, master: v.master ?? master });
    }
    masterPose = v.master ?? master;
  } else {
    const { error } = await s.sb.from('appointments').insert({ id: rdvId, branch_id: branchId, data: rdv });
    if (error) { await libereLeGeste(); return refus('pose-refusee', 500, { detail: String(error.message ?? '').slice(0, 120) }); }
  }
  await s.sb.from('assistants_prises').update({ rdv_id: rdvId }).eq('cle', cleGeste);
  await s.sb.from('assistants_prises').update({ rdv_id: rdvId }).eq('cle', cleJour).eq('assistant', moi.id);

  /* ⑦ APRÈS LA POSE : l'autre fauteuil, les tresses. */
  const heure = heureDite(date, time, maintenantMs);
  const catalogue = await s.catalogue();
  const prestations = serviceIds.map((id) => catalogue.prestations.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const prestation = prestations[0]?.name ?? '';
  let sent = 0;
  if (autre) {
    if (tenue) {
      const r = await s.deposeUnRelais(moi, { pour: autre, genre: 'place-tenue', numeroCle: numero, clientId: fiche.id, rdvId, mot: heure, perimeLe: rdv.tenue?.jusqua, heure });
      sent += r.sent;
      await s.sb.from('assistants_decisions').insert({
        id: identifiant('decision'), assistant: autre.id, genre: 'place-tenue', numero_cle: numero, client_id: fiche.id, rdv_id: rdvId,
        resume: `Place tenue ${heure} sur ton fauteuil, posée par ${moi.nom}${prestation ? `, ${prestation}` : ''}`.slice(0, 160),
        proposition: null, choix: [...CHOIX_PAR_GENRE['place-tenue']], echeance: rdv.tenue?.jusqua ?? null, branch_id: autre.branch_id ?? moi.branch_id ?? null,
      });
    } else {
      const r = await s.deposeUnRelais(moi, { pour: autre, genre: 'rdv-pose-pour-toi', numeroCle: numero, clientId: fiche.id, rdvId, mot: heure });
      sent += (await s.notifieLePorteur(autre, 'rdv-pose-pour-toi', { heure })).sent + r.sent;
    }
  }
  const tresses = prestations.some((p) => estUneTresse(p.name, catalogue.rubriques.find((r) => r.id === p.categoryId)?.label));
  if (tresses && moi.id !== 'opale') {
    const opale = await s.assistant('opale');
    if (opale) sent += (await s.deposeUnRelais(moi, { pour: opale, genre: 'hermine-a-prevenir', numeroCle: numero, clientId: fiche.id, rdvId, mot: heure })).sent;
  }

  /* ⑧ LE JOURNAL : un fait de la Maison, sans nom de cliente. */
  await s.journalise(moi.nom, { verbe: 'pose', table: 'appointments', pieceId: rdvId, piece: `Rendez-vous ${heure}${prestation ? `, ${prestation}` : ''}`, branchId });
  dis('rdv', { par: moi.id, verdict: tenue ? 'tenue' : 'pose', fenetre: dansLaFenetre, autre: autre?.id ?? null });
  return rendu({ verdict: tenue ? 'tenue' : 'pose', rdvId, master: masterPose, sent, ...(tenue ? { tenue: rdv.tenue } : {}), defaire: defaireDeLaPose(rdvId) });
}

/** Le verrou optimiste : la ligne telle qu'on l'a lue, ou « modifié entre temps ». */
async function rdvSousVerrou(s: Serveur, d: Corps): Promise<{ ok: true; ligne: { id: string; branch_id: string | null; data: Rdv; updated_at: string } } | { ok: false; reponse: Response }> {
  const rdvId = chaine(d.rdvId);
  if (!rdvId) return { ok: false, reponse: refus('rdv') };
  const updatedAt = chaine(d.updatedAt);
  if (!updatedAt) return { ok: false, reponse: refus('updated-at') };
  const ligne = await s.rdv(rdvId);
  if (!ligne) return { ok: false, reponse: refus('rdv-inconnu', 404) };
  if (Date.parse(ligne.updated_at) !== Date.parse(updatedAt)) return { ok: false, reponse: refus('modifie-entre-temps', 409, { updatedAt: ligne.updated_at }) };
  return { ok: true, ligne };
}

async function ecrisLeRdv(s: Serveur, ligne: { id: string; updated_at: string }, data: Rdv): Promise<{ id: string; updated_at: string } | null> {
  const { data: ecrit } = await s.sb.from('appointments').update({ data }).eq('id', ligne.id).eq('updated_at', ligne.updated_at).select('id, updated_at');
  const rows = (ecrit ?? []) as { id: string; updated_at: string }[];
  return rows[0] ?? null;
}

async function rdvDeplacer(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const date = d.date;
  if (!estDate(date)) return refus('date-invalide');
  const time = heureNette(d.time);
  if (!time) return refus('heure-invalide');
  const v = await rdvSousVerrou(s, d);
  if (!v.ok) return v.reponse;
  const avant = v.ligne.data;
  const apres: Rdv = { ...avant, date, time };
  const ecrit = await ecrisLeRdv(s, v.ligne, apres);
  if (!ecrit) return refus('modifie-entre-temps', 409);
  const maintenantMs = Date.now();
  const heure = heureDite(date, time, maintenantMs);
  let sent = 0;
  const autre = avant.pourMaitre && avant.pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(avant.pourMaitre, moi.id) : null;
  if (autre) {
    const r = await s.deposeUnRelais(moi, { pour: autre, genre: 'rdv-deplace', numeroCle: cleDuNumero(avant.numeroAPrevenir) ?? null, clientId: avant.clientId, rdvId: avant.id, mot: heure });
    sent += r.sent + (await s.notifieLePorteur(autre, 'rdv-deplace', { heure })).sent;
  }
  await s.journalise(moi.nom, {
    verbe: 'modifie', table: 'appointments', pieceId: v.ligne.id, piece: `Rendez-vous ${heure}`, branchId: v.ligne.branch_id,
    champs: [{ champ: 'Date', avant: avant.date, apres: date }, { champ: 'Heure', avant: avant.time, apres: time }],
  });
  return rendu({ rdvId: v.ligne.id, updatedAt: ecrit.updated_at, sent, defaire: defaireDuDeplacement(v.ligne.id, { date: avant.date, time: avant.time }, { date, time }) });
}

async function rdvAnnuler(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const v = await rdvSousVerrou(s, d);
  if (!v.ok) return v.reponse;
  const avant = v.ligne.data;
  if (avant.status === 'annulé') return rendu({ rdvId: v.ligne.id, updatedAt: v.ligne.updated_at, verdict: 'deja' });
  const ecrit = await ecrisLeRdv(s, v.ligne, { ...avant, status: 'annulé' });
  if (!ecrit) return refus('modifie-entre-temps', 409);
  const heure = heureDite(avant.date, avant.time, Date.now());
  let sent = 0;
  const autre = avant.pourMaitre && avant.pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(avant.pourMaitre, moi.id) : null;
  if (autre) {
    const r = await s.deposeUnRelais(moi, { pour: autre, genre: 'rdv-annule', numeroCle: cleDuNumero(avant.numeroAPrevenir) ?? null, clientId: avant.clientId, rdvId: avant.id, mot: heure });
    sent += r.sent + (await s.notifieLePorteur(autre, 'rdv-annule', { heure })).sent;
  }
  await s.journalise(moi.nom, {
    verbe: 'modifie', table: 'appointments', pieceId: v.ligne.id, piece: `Rendez-vous ${heure}, annulé`, branchId: v.ligne.branch_id,
    champs: [{ champ: 'Statut', avant: avant.status, apres: 'annulé' }],
  });
  return rendu({ rdvId: v.ligne.id, updatedAt: ecrit.updated_at, sent, defaire: defaireDeLAnnulation(v.ligne.id, avant.status) });
}

async function notePoser(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const rdvId = chaine(d.rdvId);
  if (!rdvId) return refus('rdv');
  const note = chaine(d.note);
  const juge = noteEstPropre(note);
  if (!juge.ok) return refus('note-refusee', 400, { detail: juge.motif });
  const ligne = await s.rdv(rdvId);
  if (!ligne) return refus('rdv-inconnu', 404);
  const maintenantMs = Date.now();
  const lu = chaine(ligne.data.note);
  const ajout = `${moi.nom}, ${jourCourt(maintenantMs)} : ${note}`;
  await s.sb.from('appointments').update({ data: { ...ligne.data, note: lu ? `${lu}\n${ajout}` : ajout } }).eq('id', rdvId);
  await s.journalise(moi.nom, { verbe: 'modifie', table: 'appointments', pieceId: rdvId, piece: `Note du carnet, rendez-vous ${heureDite(ligne.data.date, ligne.data.time, maintenantMs)}`, branchId: ligne.branch_id });
  return rendu({ rdvId, defaire: defaireDeLaNote(rdvId, ajout) });
}

const GENRES_DE_NOTIFICATION = new Set<string>(['decision', 'sommeil', 'empeche']);
async function notifier(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const genre = chaine(d.genre);
  if (!estGenreDeRelais(genre) && !GENRES_DE_NOTIFICATION.has(genre)) return refus('genre-inconnu');
  const pourId = chaine(d.pour) || 'moi';
  const pour = pourId === 'moi' || pourId === moi.id ? moi : await s.assistant(pourId);
  if (!pour) return refus('assistant-inconnu', 404);
  /* Le détail ne porte que des faits courts, sans guillemets ni numéro ; le nom est celui de l'assistant, jamais celui du corps. */
  const brut = (d.detail ?? {}) as Record<string, unknown>;
  const fait = (v: unknown): string | undefined => {
    const t = chaine(v).slice(0, 60);
    return t && !/[«»"“”„]/.test(t) && !/\d{8,}/.test(t.replace(/[\s.-]/g, '')) ? t : undefined;
  };
  const detail = { heure: fait(brut.heure), depuis: fait(brut.depuis), empeche: fait(brut.empeche), nom: moi.nom };
  const r = await s.notifieLePorteur(pour, genre as Parameters<typeof corpsDeNotification>[0], detail);
  return rendu({ sent: r.sent, ...(r.motif ? { motif: r.motif } : {}) });
}

/* ── LES DÉPENSES DU JOUR (1er novembre 2026) ─────────────────────────
   Maquette « Dépenses du jour et achats », choix tranchés au sélecteur :
   Opale propose au sélecteur, Yéman touche « Poser », et la dépense entre
   ici « à valider » (validation.etat 'attente', soumisPar = le nom de
   l'assistant). Elle ne sort d'aucune caisse avant le oui d'un souverain ou
   d'un gérant, à l'écran Dépenses. Jamais un prestataire (sa mission naît du
   rituel honoré), jamais un doublon du jour, jamais deux fois le même geste.
   Les règles : shared/assistants-depenses-pur. */
/** Ce que la Maison connaît d'une dépense, contrôlé sans rien écrire : le
    prestataire (refusé), la catégorie, la caisse, le porteur, le doublon du
    jour (sauf « C'en est une autre »). Commun à `depense.poser`, à la carte
    déposée et à la carte validée. */
type DepenseControlee = { branchId: string; label: string; categorie: string; caisse: string; porteur?: string };
async function controleLaDepense(s: Serveur, moi: LigneAssistant, v: DemandeLue): Promise<({ ok: true } & DepenseControlee) | { ok: false; refus: Response }> {
  const branchId = chaine(moi.branch_id) || (await s.brancheVedette())?.id || BRANCHE_PHARE;
  const [cats, boites, docs] = await Promise.all([
    s.sb.from('expense_categories').select('id, data').limit(500),
    s.sb.from('cashboxes').select('id, data').limit(1000),
    s.sb.from('documents').select('key, data').in('key', ['mnd_porteurs', 'mnd_prestataires']),
  ]);
  const doc = (k: string): unknown => ((docs.data ?? []) as { key: string; data?: unknown }[]).find((x) => x.key === k)?.data;
  const prestataires = (Array.isArray(doc('mnd_prestataires')) ? doc('mnd_prestataires') : []) as { name?: unknown; archived?: unknown }[];
  const prestataire = prestataireNomme([v.objet, v.beneficiaire], prestataires);
  if (prestataire) return { ok: false, refus: refus('prestataire', 409, { prestataire, detail: 'sa mission naît du rituel honoré, son paiement fait la dépense' }) };
  const categories = lignesDe(cats.data as Ligne[] | null) as { name?: unknown }[];
  const categorie = categorieConnue(v.categorie, categories);
  if (!categorie) return { ok: false, refus: refus('categorie-inconnue', 400, { categories: categories.map((c) => chaine(c.name)).filter(Boolean) }) };
  const caisse = caisseDeLaDepense(v.caisse, lignesDe(boites.data as Ligne[] | null), branchId);
  if (!caisse.ok) return { ok: false, refus: refus('caisse-inconnue', 400, { caisses: caisse.caisses }) };
  let porteur: string | undefined;
  if (v.porteur) {
    const liste = Array.isArray(doc('mnd_porteurs')) ? (doc('mnd_porteurs') as unknown[]) : [];
    porteur = porteurConnu(v.porteur, liste) ?? undefined;
    if (!porteur) return { ok: false, refus: refus('porteur-inconnu', 400, { porteurs: liste.map((x) => chaine(x)).filter(Boolean) }) };
  }
  const label = libelleDeLaDepense(v.objet, v.beneficiaire);

  /* LE DOUBLON DU JOUR : déjà au Trône, on le dit et on attend (« C'en est une autre » : `autre`). */
  if (!v.autre) {
    const { data: duJour } = await s.sb.from('expenses').select('id, data').eq('branch_id', branchId).eq('data->>date', v.date).limit(1000);
    const doublon = doublonDeLaDepense({ branchId, date: v.date, amountXof: v.montantXof, label }, lignesDe(duJour as Ligne[] | null) as DepenseExistante[]);
    if (doublon) {
      return { ok: false, refus: refus('doublon', 409, { deja: {
        id: doublon.id, label: doublon.label, amountXof: doublon.amountXof, date: doublon.date, saisiePar: saisiePar(doublon),
        ...(doublon.validation?.soumisLe ? { soumisLe: doublon.validation.soumisLe } : {}),
      } }) };
    }
  }
  return { ok: true, branchId, label, categorie, caisse: caisse.caisse, ...(porteur ? { porteur } : {}) };
}

/** La ligne `expenses`, telle que le Trône la lit (forme de `Expense`). */
const ligneDeLaDepense = (c: DepenseControlee, v: DemandeLue, id: string, validation: Corps, fichier?: Corps) => ({
  id, branchId: c.branchId, label: c.label, amountXof: v.montantXof, date: v.date, cashbox: c.caisse, category: c.categorie, recurring: null,
  ...(c.porteur ? { porteur: c.porteur } : {}), ...(fichier ? { fichier } : {}),
  validation,
});

/** L'écriture : posée, déjà là (un geste rejoué entre-temps), ou en échec. */
async function poseLaLigne(s: Serveur, id: string, branchId: string, depense: Corps): Promise<'posee' | 'deja' | 'echec'> {
  const { error } = await s.sb.from('expenses').insert({ id, branch_id: branchId, data: depense });
  if (!error) return 'posee';
  const { data: posee } = await s.sb.from('expenses').select('id').eq('id', id).maybeSingle();
  if (posee) return 'deja';
  dis('dépense non écrite', { motif: String(error.message ?? '').slice(0, 80) });
  return 'echec';
}

async function depensePoser(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const lue = lisLaDemandeDeDepense(d, aujourdhui);
  if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
  const v = lue.v;
  const idempotence = chaine(d.idempotence);
  if (!idempotence) return refus('idempotence');
  const recuLu = lisLeRecu(d.recu);
  if (!recuLu.ok) return refus(recuLu.motif);
  const id = await idDeLaDepense(moi.id, idempotence);

  /* ① LE MÊME GESTE, rejoué après un redémarrage : rien de plus. */
  const { data: dejaLa } = await s.sb.from('expenses').select('id').eq('id', id).maybeSingle();
  if (dejaLa) return rendu({ verdict: 'deja', id });

  /* ② et ③ Ce que la Maison connaît (catégories, caisses, porteurs,
     prestataires) et le doublon du jour : `controleLaDepense`. */
  const c = await controleLaDepense(s, moi, v);
  if (!c.ok) return c.refus;
  const { branchId, label, categorie } = c;

  /* ④ LE REÇU, là où le Trône range les pièces jointes des dépenses. */
  let fichier: { chemin: string; nom: string; type: string; taille: number } | undefined;
  if (recuLu.recu) {
    const chemin = cheminDuRecu(branchId, id, recuLu.recu.nom);
    const { error } = await s.sb.storage.from(COMPARTIMENT_DES_RECUS).upload(chemin, recuLu.recu.octets, { contentType: recuLu.recu.type, upsert: true });
    if (error) { dis('reçu non déposé', { motif: String(error.message ?? '').slice(0, 80) }); return refus('recu-non-depose', 502); }
    fichier = { chemin, nom: recuLu.recu.nom, type: recuLu.recu.type, taille: recuLu.recu.octets.length };
  }

  /* ⑤ LA LIGNE, À VALIDER. */
  const depense = ligneDeLaDepense(c, v, id, { etat: 'attente', soumisLe: maintenant, soumisPar: moi.nom }, fichier);
  const ecrite = await poseLaLigne(s, id, branchId, depense);
  if (ecrite === 'deja') return rendu({ verdict: 'deja', id });
  if (ecrite === 'echec') return refus('ecriture', 500);
  await s.journalise(moi.nom, { verbe: 'pose', table: 'expenses', pieceId: id, piece: pieceDuJournal(v.montantXof, categorie), branchId });
  return rendu({
    verdict: 'posee', id, label, amountXof: v.montantXof, date: v.date, cashbox: c.caisse, category: categorie,
    ...(c.porteur ? { porteur: c.porteur } : {}), recu: !!fichier,
  });
}

/* ── LE BILAN DU MATIN (2 novembre 2026, le socle) ────────────────────
   Avant 6 h 45, chaque professionnel qui passe au Trône dépose les compteurs
   de sa journée écoulée (bilanEstPropre : des nombres, un mot sans nom ni
   numéro) ; Saphir les lit à 7 h pour le Conseil du matin. Un bilan par
   assistant et par jour : le redire le remplace. */
async function bilanDeposer(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const lu = bilanEstPropre(d.bilan ?? { jour: d.jour, comptes: d.comptes, mot: d.mot });
  if (!lu.ok) return refus('bilan-refuse', 400, { detail: lu.motif });
  const maintenantMs = Date.now();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const plusAncien = dateCotonouDans(maintenantMs, -JOURS_DU_BILAN);
  if (lu.bilan.jour > aujourdhui || lu.bilan.jour < plusAncien) return refus('jour-hors-borne', 400, { detail: `de ${plusAncien} à ${aujourdhui}` });
  const id = `${moi.id}:${lu.bilan.jour}`;
  const { error } = await s.sb.from('assistants_bilans').upsert(
    { id, assistant: moi.id, jour: lu.bilan.jour, comptes: lu.bilan.comptes, mot: lu.bilan.mot ?? null }, { onConflict: 'id' });
  if (error) { dis('bilan non écrit', { motif: String(error.message ?? '').slice(0, 80) }); return refus('ecriture', 500); }
  return rendu({ id, jour: lu.bilan.jour, comptes: lu.bilan.comptes });
}

/* ── RETROUVER UNE FICHE (1er novembre 2026), lecture seule ────────────
   Le fil de Yéman à elle-même sert aussi aux rendez-vous : Opale retrouve la
   fiche par son nom ou son numéro, et ses rendez-vous à venir, avant de
   proposer au sélecteur puis de passer par `rdv.poser`, `rdv.deplacer` ou
   `rdv.annuler`. Bornes : shared/assistants-fiches-pur. Une ligne « lu » au
   journal, sans le nom cherché ; soixante lectures par jour et par assistant. */
async function ficheChercher(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const maintenantMs = Date.now();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const lue = lisLaRecherche({ nom: d.nom, numeroCle: d.numeroCle }, cleDuNumero);
  if (!lue.ok) return refus(lue.motif);
  const debutDuJour = new Date(Date.parse(`${aujourdhui}T00:00:00+01:00`)).toISOString();
  const { data: lues } = await s.sb.from('journal_gestes').select('id')
    .eq('data->>parNom', moi.nom).eq('data->>verbe', 'lit').gte('data->>quand', debutDuJour).limit(LECTURES_PAR_JOUR + 1);
  if ((lues ?? []).length >= LECTURES_PAR_JOUR) return refus('plafond-des-lectures', 429, { auPlus: LECTURES_PAR_JOUR });

  let trouvees: { id: string; data: Record<string, unknown> }[] = [];
  if ('numero' in lue) {
    const ids = (await s.fichesDuNumero(lue.numero)).map((f) => f.id).slice(0, 20);
    if (ids.length) {
      const { data } = await s.sb.from('clients').select('id, data').in('id', ids);
      trouvees = (data ?? []) as { id: string; data: Record<string, unknown> }[];
    }
  } else {
    const { data } = await s.sb.from('clients').select('id, data').ilike('data->>name', motifDeLaBase(lue.nom)).limit(300);
    trouvees = ((data ?? []) as { id: string; data: Record<string, unknown> }[]).filter((r) => ficheCorrespond(chaine(r.data?.name), lue.nom));
  }
  trouvees = trouvees.filter((r) => r.data?.archived !== true).sort((a, b) => chaine(a.data?.name).localeCompare(chaine(b.data?.name), 'fr'));
  const plus = trouvees.length > FICHES_AU_PLUS;
  const { prestations } = await s.catalogue();
  const nomDe = (id: string) => prestations.find((p) => p.id === id)?.name || undefined;
  const fiches = [];
  for (const f of trouvees.slice(0, FICHES_AU_PLUS)) {
    const { data: appts } = await s.sb.from('appointments').select('id, data, updated_at').eq('data->>clientId', f.id).gte('data->>date', aujourdhui).limit(20);
    const rdvs = ((appts ?? []) as { id: string; data: Rdv; updated_at: string }[]).map((a) => ({
      id: a.id, date: a.data.date, time: a.data.time, status: a.data.status, serviceIds: a.data.serviceIds, updatedAt: a.updated_at,
    }));
    fiches.push(ficheLisible({ id: f.id, data: f.data ?? {} }, rdvs, nomDe, aujourdhui));
  }
  await s.journalise(moi.nom, { verbe: 'lit', table: 'clients', pieceId: identifiant('lecture'), piece: pieceDeLaLecture(fiches.length), branchId: moi.branch_id });
  return rendu({ fiches, plus });
}

/* ── UNE CONSIGNE AUX ASSISTANTS (5 novembre 2026, lot 1) ──────────────
   Maquette 2AqfEEiPvpdfUUkXzs2XUC, validée. La direction écrit au Trône
   (table `assistants_consignes`, sous RLS, à son nom) ; l'assistant reconnu
   par son jeton lit ce qui est à lui, répond, ou passe à un autre. Seule la
   consigne qui attend un oui notifie (la carte est déposée avant, par
   `decision.deposer` SANS --notifier). Les règles : shared/consignes-pur. */
const consigneDe = (l: LigneConsigne) => ({
  id: l.id, de: l.de, texte: l.texte, statut: l.statut, nouvelle: estNouvelle(l.statut), ecriteLe: l.ecrite_le,
  lueLe: l.lue_le ?? null, ...(l.reponse ? { reponse: l.reponse } : {}),
  ...(l.passee_de ? { passeeDe: l.passee_de, passeeLe: l.passee_le ?? null, ...(l.passee_mot ? { passeeMot: l.passee_mot } : {}) } : {}),
  ...(l.decision_id ? { decisionId: l.decision_id } : {}),
});

async function consigneLire(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  /* `marquer: false` : le guetteur regarde sans rien marquer ; la session, elle, marque « lue ». */
  const marquer = d.marquer !== false;
  const maintenant = new Date().toISOString();
  const { data, error } = await s.sb.from('assistants_consignes').select('*').eq('pour', moi.id).in('statut', [...STATUTS_A_LIRE])
    .order('ecrite_le', { ascending: true }).limit(CONSIGNES_LUES_AU_PLUS);
  if (error) { dis('consignes illisibles', { motif: String(error.message ?? '').slice(0, 80) }); return refus('consignes-absentes', 503); }
  const lignes = (data ?? []) as LigneConsigne[];
  /* Le guetteur (ou la session) a regardé : l'écran le dit. Une colonne à part, jamais `etat`. */
  try { await s.sb.from('assistants').update({ guette_le: maintenant }).eq('id', moi.id); } catch { /* la colonne manque avant 0162 */ }
  /* L'état des cartes liées : le oui (ou le non) de la direction, à exécuter puis à clore. */
  const ids = lignes.map((l) => l.decision_id).filter((x): x is string => !!x);
  const cartes = new Map<string, LigneDecision>();
  if (ids.length) {
    const { data: decs } = await s.sb.from('assistants_decisions').select('*').in('id', ids);
    for (const dec of (decs ?? []) as LigneDecision[]) cartes.set(dec.id, dec);
  }
  const nouvelles = lignes.filter((l) => estNouvelle(l.statut)).map((l) => l.id);
  if (marquer && nouvelles.length) {
    await s.sb.from('assistants_consignes').update({ statut: 'lue', lue_le: maintenant })
      .in('id', nouvelles).eq('pour', moi.id).in('statut', [...STATUTS_NOUVEAUX]);
  }
  const consignes = lignes.map((l) => {
    const c = consigneDe(l);
    const dec = l.decision_id ? cartes.get(l.decision_id) : undefined;
    const lue = marquer && estNouvelle(l.statut) ? { statut: 'lue', lueLe: maintenant } : {};
    return {
      ...c, ...lue,
      ...(dec ? { carte: { tranchee: dec.tranchee ?? null, texteModifie: dec.texte_modifie ?? null, executeeLe: dec.executee_le ?? null } } : {}),
    };
  });
  return rendu({ assistant: { id: moi.id, nom: moi.nom }, marquees: marquer ? nouvelles.length : 0, nouvelles: nouvelles.length, consignes });
}

async function consigneRepondre(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const id = chaine(d.id);
  if (!id) return refus('id');
  const { data } = await s.sb.from('assistants_consignes').select('*').eq('id', id).maybeSingle();
  const c = (data ?? null) as LigneConsigne | null;
  if (!c) return refus('consigne-inconnue', 404);
  if (c.pour !== moi.id) return refus('pas-a-toi', 403);
  const juge = reponseDeConsigne({ actuel: c.statut, statut: d.statut, reponse: d.reponse, defaire: d.defaire, decision: d.decision });
  if (!juge.ok) return refus(juge.motif, juge.motif === 'deja-close' ? 409 : 400, juge.detail ? { detail: juge.detail } : {});
  const r = juge.r;
  /* La carte liée : la sienne, jamais celle d'un autre assistant. */
  if (r.decisionId) {
    const { data: dec } = await s.sb.from('assistants_decisions').select('id, assistant').eq('id', r.decisionId).maybeSingle();
    if (!dec) return refus('decision-inconnue', 404);
    if ((dec as { assistant?: string }).assistant !== moi.id) return refus('pas-ta-carte', 403);
  }
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const patch: Corps = {
    statut: r.statut, reponse: r.reponse, lue_le: c.lue_le ?? maintenant,
    ...(r.statut === 'faite' ? { faite_le: maintenant, defaire: r.gestes.length ? r.gestes : null } : {}),
    ...(r.decisionId ? { decision_id: r.decisionId } : {}),
  };
  /* Sous le statut lu : deux réponses croisées, la seconde est refusée. */
  const { data: ecrit } = await s.sb.from('assistants_consignes').update(patch).eq('id', id).eq('pour', moi.id).eq('statut', c.statut).select('id');
  if (!ecrit || (ecrit as unknown[]).length === 0) return refus('modifie-entre-temps', 409);
  /* LA SEULE NOTIFICATION : une consigne qui attend un oui. Une fois par
     consigne ; au porteur de l'assistant (c'est lui qui voit la carte), et à
     qui a écrit la consigne si c'est un autre compte. Jamais la nuit (de 22 h
     à 7 h, heure de Cotonou) : la carte attend au Trône. */
  let notifie = 0;
  let nuit = false;
  if (r.statut === 'oui-attendu' && !c.notifie_le) {
    if (!notificationPermise(aCotonou(maintenantMs).heure)) nuit = true;
    else {
      const { titre, corps } = notificationDuOui(moi.nom);
      const comptes = [...new Set([moi.porteur_user_id, c.de_user_id].filter((x): x is string => !!x))];
      for (const u of comptes) notifie += await s.notifieLeCompte(u, titre, corps, ETIQUETTE_DES_CONSIGNES);
      await s.sb.from('assistants_consignes').update({ notifie_le: maintenant }).eq('id', id);
    }
  }
  dis('consigne', { par: moi.id, statut: r.statut, gestes: r.gestes.length, notifie });
  return rendu({
    id, statut: r.statut, notifie, ...(nuit ? { nuit: true } : {}),
    ...(r.statut === 'faite' && r.gestes.length ? { defaireJusqua: new Date(maintenantMs + DEFAIRE_PENDANT_MS).toISOString() } : {}),
  });
}

async function consignePasser(s: Serveur, moi: LigneAssistant, d: Corps): Promise<Response> {
  const id = chaine(d.id);
  if (!id) return refus('id');
  const { data } = await s.sb.from('assistants_consignes').select('*').eq('id', id).maybeSingle();
  const c = (data ?? null) as LigneConsigne | null;
  if (!c) return refus('consigne-inconnue', 404);
  if (c.pour !== moi.id) return refus('pas-a-toi', 403);
  if (!peutPasser(c.statut)) return refus('deja-close', 409);
  const pourId = chaine(d.pour).toLowerCase();
  if (!pourId || pourId === moi.id) return refus('pour-invalide');
  const cible = await s.assistant(pourId);
  if (!cible) return refus('assistant-inconnu', 404);
  const mot = chaine(d.mot);
  if (mot.length > MOT_DE_PASSE_AU_PLUS) return refus('mot-trop-long', 400, { detail: `${MOT_DE_PASSE_AU_PLUS} caractères au plus` });
  const maintenant = new Date().toISOString();
  const { data: ecrit } = await s.sb.from('assistants_consignes').update({
    pour: cible.id, statut: 'passee', passee_de: moi.id, passee_le: maintenant, passee_mot: mot || null, lue_le: null,
  }).eq('id', id).eq('pour', moi.id).eq('statut', c.statut).select('id');
  if (!ecrit || (ecrit as unknown[]).length === 0) return refus('modifie-entre-temps', 409);
  return rendu({ id, pour: cible.id, nom: cible.nom, relie: !!cible.empreinte });
}

/* ── Les actions de la porte B (un souverain, depuis l'écran) ────────── */

async function jetonDonner(s: Serveur, qui: Souverain, d: Corps): Promise<Response> {
  const id = chaine(d.id).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) return refus('id-invalide');
  const present = await s.assistant(id);
  /* LE JETON D UN ASSISTANT SE DONNE DEPUIS LE COMPTE DE SON PORTEUR (31 octobre
     2026, étape 2) : Yéman qui cliquerait « Donner un jeton » pour Onyx en
     deviendrait la porteuse et recevrait ses décisions. Refus si l assistant est
     déjà porté par un autre compte, ou si le maître visé (team) ne porte pas le
     nom du souverain connecté. Un assistant neuf, sans porteur, est à qui le relie. */
  if (present?.porteur_user_id && present.porteur_user_id !== qui.userId) return refus('pas-ton-assistant', 403);
  const teamVise = chaine(d.porteurTeamId) || present?.porteur_team_id || '';
  if (teamVise) {
    const { data: t } = await s.sb.from('team').select('data').eq('id', teamVise).maybeSingle();
    const nomDuMaitre = chaine((t as { data?: { name?: unknown } } | null)?.data?.name).trim().toLowerCase();
    if (nomDuMaitre && nomDuMaitre !== qui.nom.trim().toLowerCase()) return refus('pas-ton-assistant', 403);
  }
  const jeton = nouveauJetonAssistant(id);
  const empreinte = await empreinteDuJetonAssistant(jeton);
  const maintenant = new Date().toISOString();
  const nom = chaine(d.nom).slice(0, 40) || present?.nom || id.charAt(0).toUpperCase() + id.slice(1);
  const champs = {
    nom, porteur_team_id: chaine(d.porteurTeamId) || present?.porteur_team_id || null, porteur_user_id: qui.userId,
    appareil: chaine(d.appareil).slice(0, 80) || present?.appareil || null, empreinte, jeton_pose_le: maintenant,
  };
  if (present) await s.sb.from('assistants').update(champs).eq('id', id);
  else await s.sb.from('assistants').insert({ id, ...champs, etat: {}, branch_id: (await s.brancheVedette())?.id ?? null });
  dis('jeton donné', { assistant: id });
  /* Le jeton, UNE FOIS, à l'écran seulement : jamais au journal, jamais en base. */
  return rendu({ id, nom, jeton });
}

async function jetonRetirer(s: Serveur, _qui: Souverain, d: Corps): Promise<Response> {
  const id = chaine(d.id).toLowerCase();
  const present = await s.assistant(id);
  if (!present) return refus('assistant-inconnu', 404);
  await s.sb.from('assistants').update({ empreinte: null }).eq('id', id);
  dis('jeton retiré', { assistant: id });
  return rendu({ id });
}

async function decisionTrancher(s: Serveur, qui: Souverain, d: Corps): Promise<Response> {
  const id = chaine(d.id);
  if (!id) return refus('id');
  const { data } = await s.sb.from('assistants_decisions').select('*').eq('id', id).maybeSingle();
  const dec = (data ?? null) as LigneDecision | null;
  if (!dec) return refus('decision-inconnue', 404);
  const sien = await s.assistant(dec.assistant);
  if (!sien || sien.porteur_user_id !== qui.userId) return refus('pas-ta-decision', 403);
  if (dec.tranchee) return refus('deja-tranchee', 409);
  const choix = chaine(d.choix);
  const permis = Array.isArray(dec.choix) ? (dec.choix as string[]) : [];
  if (!permis.includes(choix)) return refus('choix-inconnu');
  if (dec.genre === 'place-tenue') return placeTrancher(s, qui, { ...d, decisionId: dec.id, choix, mot: d.texte ?? d.mot });
  if (dec.genre === 'depense') return carteDeDepenseTranchee(s, qui, sien, dec, choix, d);
  const maintenant = new Date().toISOString();
  const texte = (CHOIX_AVEC_TEXTE as readonly string[]).includes(choix) ? chaine(d.texte).slice(0, 1000) || null : null;
  await s.sb.from('assistants_decisions').update({
    tranchee: choix, tranchee_le: maintenant, tranchee_par: qui.userId, texte_modifie: texte, ...effaceLePrive(dec, maintenant),
  }).eq('id', id);
  return rendu({ id, choix });
}

/* ── LA CARTE D'UNE DÉPENSE, TRANCHÉE (2 novembre 2026) ───────────────
   Choix 4 de « Je suis loin » : un toucher suffit. « Valider » pose ICI la
   dépense, déjà validée au nom du porteur (`validation` : soumise par
   l'assistant, décidée par le souverain, comme `validee(soumission(…))` du
   Trône) ; « Corriger » la pose avec les faits corrigés sur la carte ;
   « Non » ne pose rien. L'identifiant tient à la clé du message (comme
   `depense.poser`) : la même dépense ne s'écrit jamais deux fois. Un refus
   (un doublon apparu depuis, une catégorie rangée) revient à l'écran avec son
   motif, et la carte reste à trancher. */
async function carteDeDepenseTranchee(s: Serveur, qui: Souverain, sien: LigneAssistant, dec: LigneDecision, choix: string, d: Corps): Promise<Response> {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const trancheLaCarte = async (plus: Corps = {}) => {
    await s.sb.from('assistants_decisions').update({
      tranchee: choix, tranchee_le: maintenant, tranchee_par: qui.userId, texte_modifie: null, executee_le: maintenant,
      ...effaceLePrive(dec, maintenant), ...plus,
    }).eq('id', dec.id);
  };
  if (choix === 'non') { await trancheLaCarte(); return rendu({ id: dec.id, choix }); }

  const avant = (dec.faits ?? {}) as Corps;
  const brut = (d.faits && typeof d.faits === 'object' ? d.faits : {}) as Corps;
  const corrections: Corps = {};
  if (choix === 'corriger') {
    for (const k of ['montantXof', 'objet', 'categorie', 'caisse']) if (brut[k] !== undefined && brut[k] !== '') corrections[k] = brut[k];
    if (Object.keys(corrections).length === 0) return refus('faits-refuses', 400, { detail: 'ce qui est corrigé : montant, objet, catégorie ou caisse' });
  }
  const lus = faitsDeLaCarte('depense', { ...avant, ...corrections });
  if (!lus.ok) return refus('faits-refuses', 400, { detail: lus.motif });
  const f = lus.faits as FaitsDeDepense;
  const autre = avant.autre === true || d.autre === true;
  const lue = lisLaDemandeDeDepense({ ...f, autre }, aCotonou(maintenantMs).dateISO);
  if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
  const faitsTenus = { ...f, ...(autre ? { autre: true } : {}) };

  const id = await idDeLaDepense(sien.id, f.cle);
  const { data: dejaLa } = await s.sb.from('expenses').select('id').eq('id', id).maybeSingle();
  if (dejaLa) { await trancheLaCarte({ faits: faitsTenus }); return rendu({ id: dec.id, choix, depense: { verdict: 'deja', id } }); }

  const c = await controleLaDepense(s, sien, lue.v);
  if (!c.ok) return c.refus;
  const validation = { etat: 'validee', soumisLe: maintenant, soumisPar: sien.nom, decidePar: qui.nom, decideLe: maintenant };
  const ecrite = await poseLaLigne(s, id, c.branchId, ligneDeLaDepense(c, lue.v, id, validation));
  if (ecrite === 'echec') return refus('ecriture', 500);
  if (ecrite === 'posee') {
    await s.journalise(qui.nom, {
      verbe: 'pose', table: 'expenses', pieceId: id, branchId: c.branchId,
      piece: pieceDuJournal(lue.v.montantXof, c.categorie).replace('Dépense à valider', 'Dépense validée sur une carte'),
    });
  }
  await trancheLaCarte({ faits: { ...faitsTenus, categorie: c.categorie, caisse: c.caisse } });
  return rendu({ id: dec.id, choix, depense: { verdict: ecrite, id, amountXof: lue.v.montantXof, category: c.categorie, cashbox: c.caisse } });
}

/* ── « JE SUIS LOIN / JE SUIS LÀ » (2 novembre 2026) ─────────────────
   Le bouton du porteur, en haut des Assistants : il pose ou retire le mode sur
   SES assistants qui passent au Trône (une session sur son ordinateur, jamais
   ceux d'un autre, jamais une fonction). Deux colonnes à part : un passage
   réécrit `etat`, jamais elles. Loin, l'assistant ne pose plus de question au
   sélecteur : tout part en cartes, et le tour notifie. */
async function loinBasculer(s: Serveur, qui: Souverain, d: Corps): Promise<Response> {
  if (typeof d.loin !== 'boolean') return refus('loin', 400, { detail: 'loin : vrai ou faux' });
  const loin = d.loin;
  const miens = (await s.assistants()).filter((a) => {
    const p = professionnel(a.id);
    return a.porteur_user_id === qui.userId && !!p && passeAuTrone(p);
  });
  if (miens.length === 0) return refus('pas-d-assistant', 404, { detail: 'aucun assistant à vous ne passe au Trône' });
  const maintenant = new Date().toISOString();
  const avant = miens.some((a) => modeDe(a.loin_depuis).loin);
  const apres: Corps[] = [];
  for (const a of miens) {
    const depuis = loin ? (modeDe(a.loin_depuis).loinDepuis ?? maintenant) : null;
    await s.sb.from('assistants').update({ loin_depuis: depuis, loin_par: loin ? qui.nom : null }).eq('id', a.id);
    apres.push({ id: a.id, nom: a.nom, ...modeDe(depuis) });
  }
  await s.journalise(qui.nom, {
    verbe: 'modifie', table: 'assistants', pieceId: miens.map((a) => a.id).join(','),
    piece: loin ? 'Je suis loin : les cartes au Trône' : 'Je suis là : les questions à l\'ordinateur',
    champs: [{ champ: 'Mode', avant: avant ? 'loin' : 'là', apres: loin ? 'loin' : 'là' }],
  });
  return rendu({ loin, assistants: apres });
}

async function placeTrancher(s: Serveur, qui: Souverain, d: Corps): Promise<Response> {
  const choix = chaine(d.choix);
  if (!['confirmer', 'autre-heure', 'non'].includes(choix)) return refus('choix-inconnu');
  let dec: LigneDecision | null = null;
  if (chaine(d.decisionId)) {
    const { data } = await s.sb.from('assistants_decisions').select('*').eq('id', chaine(d.decisionId)).maybeSingle();
    dec = (data ?? null) as LigneDecision | null;
    if (!dec) return refus('decision-inconnue', 404);
  } else if (chaine(d.rdvId)) {
    const { data } = await s.sb.from('assistants_decisions').select('*').eq('rdv_id', chaine(d.rdvId)).eq('genre', 'place-tenue').is('tranchee', null).limit(1);
    dec = ((data ?? []) as LigneDecision[])[0] ?? null;
  } else return refus('decision-ou-rdv');
  const rdvId = dec?.rdv_id ?? chaine(d.rdvId);
  const ligne = rdvId ? await s.rdv(rdvId) : null;
  if (!ligne) return refus('rdv-inconnu', 404);
  const rdv = ligne.data;
  if (!rdv.tenue) return refus('pas-une-place-tenue');
  /* Qui tranche : le porteur de l'assistant à qui la décision est laissée ; à défaut, celui dont le fauteuil est visé. */
  const sien = dec ? await s.assistant(dec.assistant) : await s.assistantDuMaitre(rdv.pourMaitre ?? '', '');
  if (!sien || sien.porteur_user_id !== qui.userId) return refus('pas-ta-decision', 403);
  if (dec?.tranchee) return refus('deja-tranchee', 409);
  if (rdv.tenue.confirmeeLe || rdv.tenue.refuseeLe) return refus('deja-tranchee', 409);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const heure = heureDite(rdv.date, rdv.time, maintenantMs);
  const date = estDate(d.date) ? d.date : null;
  const time = heureNette(d.time);
  const heureProposee = choix === 'autre-heure' && date && time ? heureDite(date, time, maintenantMs) : null;

  const apres: Rdv = choix === 'confirmer'
    ? { ...rdv, status: 'confirmé', sansConfirmation: false, tenue: { ...rdv.tenue, confirmeeLe: maintenant } }
    : { ...rdv, status: 'annulé', tenue: { ...rdv.tenue, refuseeLe: maintenant } };
  const ecrit = await ecrisLeRdv(s, ligne, apres);
  if (!ecrit) return refus('modifie-entre-temps', 409);
  if (dec) {
    await s.sb.from('assistants_decisions').update({
      tranchee: choix, tranchee_le: maintenant, tranchee_par: qui.userId, texte_modifie: heureProposee ?? (chaine(d.mot).slice(0, 200) || null), ...effaceLePrive(dec, maintenant),
    }).eq('id', dec.id);
  }
  /* Le relais à celui qui a posé, et la notification de son porteur. */
  const poseur = await s.assistant(rdv.tenue.par);
  let sent = 0;
  if (poseur && poseur.id !== sien.id) {
    const genre: GenreDeRelais = choix === 'confirmer' ? 'place-confirmee' : 'place-refusee';
    const r = await s.deposeUnRelais(sien, { pour: poseur, genre, numeroCle: cleDuNumero(rdv.numeroAPrevenir) ?? dec?.numero_cle ?? null, clientId: rdv.clientId, rdvId: rdv.id, mot: heureProposee ?? heure });
    sent += r.sent + (await s.notifieLePorteur(poseur, genre, { heure: heureProposee ?? heure })).sent;
  }
  /* La confirmation officielle de la Maison, au « Confirmer » seulement. */
  let deposes = 0;
  if (choix === 'confirmer') deposes = await s.deposeLaConfirmationOfficielle(apres, maintenantMs);
  await s.journalise(qui.nom, {
    verbe: 'modifie', table: 'appointments', pieceId: rdv.id, branchId: ligne.branch_id,
    piece: `${choix === 'confirmer' ? 'Place confirmée' : 'Place refusée'}, rendez-vous ${heure}`,
    champs: [{ champ: 'Statut', avant: rdv.status, apres: apres.status }],
  });
  return rendu({ rdvId: rdv.id, choix, updatedAt: ecrit.updated_at, sent, deposes });
}

/* ── La porte, puis l'action ──────────────────────────────────────────── */

async function laPorte(sb: Base, req: Request): Promise<Porte | null> {
  const jetonAssistant = (req.headers.get(EN_TETE_DU_JETON_ASSISTANT) ?? '').trim();
  if (jetonAssistant) {
    const empreinte = await empreinteDuJetonAssistant(jetonAssistant);
    const { data } = await sb.from('assistants').select('*').eq('empreinte', empreinte).maybeSingle();
    if (data) return { genre: 'jeton', moi: data as LigneAssistant };
  }
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (jwt) {
    const { data: lu } = await sb.auth.getUser(jwt);
    const uid = lu?.user?.id;
    if (uid) {
      const { data: staff } = await sb.from('staff').select('user_id, name, role').eq('user_id', uid).maybeSingle();
      if (staff && staff.role === 'souverain') return { genre: 'souverain', qui: { userId: uid, nom: chaine(staff.name) || 'Un souverain' } };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!url || !service) return json({ ok: false, motif: 'environnement', version: VERSION }, 500);
  const sb: Base = createClient(url, service);
  const s = new Serveur(sb, url, service);

  if (req.method === 'GET') {
    const n = (await s.assistants()).length;
    return json({ ok: true, fonction: 'assistants-maison', version: VERSION, assistants: n });
  }
  if (req.method !== 'POST') return refus('POST seulement', 405);

  try {
    let d: Corps = {};
    try { d = (await req.json()) as Corps; } catch { return refus('demande-illisible'); }
    const action = chaine(d.action);
    const exige = porteDeLAction(action);
    if (!exige) return refus('action-inconnue');

    const porte = await laPorte(sb, req);
    if (!porte) return refus('reserve-aux-assistants', 403);
    if (porte.genre !== exige) return refus('mauvaise-porte', 403);

    if (porte.genre === 'jeton') {
      const moi = porte.moi;
      switch (action as typeof ACTIONS_DU_JETON[number]) {
        case 'passage': return await passage(s, moi, d);
        case 'relais.deposer': return await relaisDeposer(s, moi, d);
        case 'relais.traiter': return await relaisTraiter(s, moi, d);
        case 'decision.deposer': return await decisionDeposer(s, moi, d);
        case 'decision.executee': return await decisionExecutee(s, moi, d);
        case 'rdv.poser': return await rdvPoser(s, moi, d);
        case 'rdv.deplacer': return await rdvDeplacer(s, moi, d);
        case 'rdv.annuler': return await rdvAnnuler(s, moi, d);
        case 'note.poser': return await notePoser(s, moi, d);
        case 'notifier': return await notifier(s, moi, d);
        case 'depense.poser': return await depensePoser(s, moi, d);
        case 'fiche.chercher': return await ficheChercher(s, moi, d);
        case 'bilan.deposer': return await bilanDeposer(s, moi, d);
        case 'consigne.lire': return await consigneLire(s, moi, d);
        case 'consigne.repondre': return await consigneRepondre(s, moi, d);
        case 'consigne.passer': return await consignePasser(s, moi, d);
      }
    } else {
      const qui = porte.qui;
      switch (action) {
        case 'jeton.donner': return await jetonDonner(s, qui, d);
        case 'jeton.retirer': return await jetonRetirer(s, qui, d);
        case 'decision.trancher': return await decisionTrancher(s, qui, d);
        case 'place.trancher': return await placeTrancher(s, qui, d);
        case 'loin.basculer': return await loinBasculer(s, qui, d);
      }
    }
    return refus('action-inconnue');
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return refus('erreur', 500);
  }
});
