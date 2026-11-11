/* ══ ARRÊTÉ D'AVANCE, MODÈLE EN PAUSE — 5 novembre 2026 ═══════════════════
   « Est-ce possible d'avoir tous les modèles Meta qui doivent partir pour le
   Trône, quelque part dans le Trône, pour qu'on puisse contrôler chaque
   message qui part, à qui, et qu'on puisse arrêter le message au besoin ? »,
   puis « est-ce possible de mettre des modèles en pause et que ça marche
   également sur Meta ? » (Yéman, 4 novembre 2026). Maquette « Ce qui va
   partir » (v3) validée : « Ne pas envoyer » à la direction seule ; un
   interrupteur « En service / En pause » par modèle.

   UNE CLÉ PAR MESSAGE. Chaque message automatique se reconnaît à une clé
   stable, la même qu'il soit encore une prévision (l'onglet « À venir »),
   une ligne en salle ou une ligne que le facteur prend en main :
   `rappel-j1:<rdv>`, `garder:<rdv>`, `anniv:<fiche>:<année>`,
   `relance:<pièce>:<rang>`… La direction arrête une clé (table
   `envois_arretes`, 0197) ; « Remettre » pose `remisLe`, rien ne s'efface.

   LA PAUSE EST CHEZ NOUS. Meta ne permet pas à une entreprise de mettre
   elle-même un modèle en pause (seul Meta le fait, quand la qualité baisse).
   La pause vit donc dans `modeles_en_pause` (0197) : la porte d'Opale la
   refuse partout, et un modèle qui a un repli (la confirmation à liens)
   part sous son repli.

   OPALE VEILLE : un modèle dont les messages reviennent « non remis » est
   signalé au deuxième de suite et mis en pause au cinquième.

   CE BLOC EST LA SOURCE. Il est recopié tel quel dans le facteur
   (envois-partent) et dans chaque fonction qui dépose (rappels-j1,
   confirmation-rdv, avis-google, relances-factures, rappels-d-echeance,
   fete-de-couronne) ; `verifie-les-douze-lunes` (R8) compare chaque copie
   à l'original, `verifie-ce-qui-va-partir` éprouve chaque règle. Pas un mot
   « export » entre les repères : certaines fonctions sont rejouées par leur
   banc dans un `new Function`, qui ne connaît pas les modules. Module PUR. */

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

export {
  MARQUE_DE_L_ARRET, NON_REMIS_SIGNALE_AU, NON_REMIS_EN_PAUSE_AU,
  cleDuMessage, arretEnVigueur, modeleEnPause, momentDAvance, laPorteDAvance, ligneRetenueDAvance, serieDeNonRemis, veilleDuModele,
  litLesArretsEtLesPauses,
};
export type { ArretDAvance, PauseDuModele, VerdictDAvance, LigneDAvance, BaseDAvance };
