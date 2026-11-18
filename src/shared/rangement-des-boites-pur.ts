import { numeroWa } from './conversations';
import type { Boite } from './boite-unique-pur';

/* ══ ARCHIVER ET SUPPRIMER UNE DISCUSSION, LE PUR · 18 novembre 2026 ═══════
   « Il faut la faire exactement comme WhatsApp avec des messages à archiver
   ou supprimer » (Yéman, sur une capture des Conversations). Tranché au
   sélecteur le même jour, sur la maquette J6ZeXBFaesywB5Q42F1TRN :

   ARCHIVER, TOUTE L'ÉQUIPE. La discussion quitte la liste et va dans
   « Archivées ». Rien n'est effacé. Elle revient seule à son prochain
   message, dans un sens ou dans l'autre : c'est la règle de l'archive des
   fils depuis le 15 septembre (`estArchive`, shared/conversations), portée
   de la boîte entière (WhatsApp, chat du site, demandes, appels).

   SUPPRIMER, LA DIRECTION SEULE : MASQUER, GARDER EN BASE. Elle disparaît
   du Trône pour toute l'équipe, Archivées comprises. Ses messages restent
   en base : Perle s'en souvient, la preuve de ce qui a été dit reste, et
   sur son téléphone à elle rien ne change (Meta ne retire rien). Si elle
   réécrit, une discussion NEUVE commence : seules les bulles d'après la
   suppression se montrent. Cela revient sur la décision du 15 septembre
   (« archiver seulement »), à la demande de Yéman.

   LES CLÉS. Une marque se pose sous la clé de la boîte (`c:<fiche>`,
   `n:<numéro>`, `d:<discussion>`) ET sous le numéro réduit de chacun de ses
   fils (`numeroWa`), la forme de `mnd_fils_archives` depuis le 15
   septembre : la cloche, l'alarme du tableau de bord et le compte de Perle,
   qui jugent fil par fil avec `estArchive`, voient donc la même chose que
   la boîte. Les marques posées avant ce jour (un numéro seul) valent aussi.

   Les instants se comparent en millisecondes, jamais en texte : « 10:00Z »
   et « 10:00:00.000Z » disent la même heure et ne se trient pas pareil.

   PUR : aucun écran, aucun réseau, aucun magasin.
   `node scripts/verifie-le-rangement.mjs` le prouve (et `--prouve`). */

export type MarqueDeBoite = { le: string; par?: string };
/** Par clé de boîte ou par numéro réduit. */
export type MarquesDesBoites = Record<string, MarqueDeBoite>;

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN);

/** Les clés sous lesquelles une boîte se range : la sienne, puis le numéro réduit de chacun de ses fils. */
export function clesDeRangement(b: Pick<Boite, 'cle' | 'fils'>): string[] {
  const cles = new Set<string>([b.cle]);
  for (const f of b.fils) {
    const n = numeroWa(f.numero);
    if (n) cles.add(n);
  }
  return [...cles];
}

/** L'instant de sa bulle la plus récente, dans un sens ou dans l'autre (NaN si elle n'en a aucune). */
export function derniereActivite(b: Pick<Boite, 'bulles'>): number {
  let t = NaN;
  for (const x of b.bulles) {
    const q = ms(x.quand);
    if (Number.isFinite(q) && !(q <= t)) t = q;
  }
  return t;
}

/** La marque la plus récente posée sous l'une de ces clés (NaN si aucune ne se lit). */
export function marqueLaPlusRecente(cles: readonly string[], marques: Readonly<MarquesDesBoites> | null | undefined): number {
  let le = NaN;
  if (!marques) return le;
  for (const k of cles) {
    const q = ms(marques[k]?.le);
    if (Number.isFinite(q) && !(q <= le)) le = q;
  }
  return le;
}

/** ARCHIVÉE ? Oui tant qu'une de ses marques est posée après sa dernière bulle. Une boîte vide ne s'archive pas. */
export function estArchivee(b: Pick<Boite, 'cle' | 'fils' | 'bulles'>, archives: Readonly<MarquesDesBoites> | null | undefined): boolean {
  const derniere = derniereActivite(b);
  if (!Number.isFinite(derniere)) return false;
  const le = marqueLaPlusRecente(clesDeRangement(b), archives);
  return Number.isFinite(le) && derniere <= le;
}

/** CE QUI RESTE APRÈS UNE SUPPRESSION : la boîte telle quelle si on ne l'a
    jamais supprimée ; sinon ses seules bulles d'après, et `null` quand il
    n'en reste aucune (elle ne se montre plus). Sa dernière bulle et son
    dernier mot à elle se relisent sur ce qui reste. */
export function apresLaSuppression(b: Boite, supprimees: Readonly<MarquesDesBoites> | null | undefined): Boite | null {
  const le = marqueLaPlusRecente(clesDeRangement(b), supprimees);
  if (!Number.isFinite(le)) return b;
  const bulles = b.bulles.filter((x) => ms(x.quand) > le);
  if (bulles.length === 0) return null;
  const derniere = bulles.reduce((a, x) => (ms(x.quand) >= ms(a.quand) ? x : a), bulles[0]);
  const derniereDElle = b.derniereDElle && ms(b.derniereDElle.quand) > le ? b.derniereDElle : undefined;
  return { ...b, bulles, derniere, derniereDElle };
}

/** La liste de la Maison en deux : les discussions actives et les archivées ; les supprimées n'y sont plus. */
export function rangeLesBoites(
  boites: readonly Boite[],
  archives: Readonly<MarquesDesBoites> | null | undefined,
  supprimees: Readonly<MarquesDesBoites> | null | undefined,
): { actives: Boite[]; archivees: Boite[] } {
  const actives: Boite[] = [];
  const archivees: Boite[] = [];
  for (const brute of boites) {
    const b = apresLaSuppression(brute, supprimees);
    if (!b) continue;
    if (estArchivee(b, archives)) archivees.push(b); else actives.push(b);
  }
  return { actives, archivees };
}

/** Pose la marque sous ces clés (archiver, supprimer). `par` : qui l'a fait. */
export function poseLaMarque(marques: Readonly<MarquesDesBoites> | null | undefined, cles: readonly string[], par: string | undefined, quand: string): MarquesDesBoites {
  const suivant: MarquesDesBoites = { ...(marques ?? {}) };
  for (const k of cles) if (k && k !== 'n:') suivant[k] = par ? { le: quand, par } : { le: quand };
  return suivant;
}

/** Retire la marque de ces clés (désarchiver). */
export function retireLaMarque(marques: Readonly<MarquesDesBoites> | null | undefined, cles: readonly string[]): MarquesDesBoites {
  const suivant: MarquesDesBoites = { ...(marques ?? {}) };
  for (const k of cles) delete suivant[k];
  return suivant;
}

/** L'HEURE D'UNE LIGNE, comme WhatsApp : l'heure aujourd'hui (« 9 h 43 »,
    l'écriture de la Maison, celle des reçus), « Hier », le
    jour de la semaine dans les six derniers jours, sinon la date AVEC
    L'ANNÉE (une date de cliente porte toujours son année). Lue à Cotonou. */
export function heureDeLaLigne(iso: string | undefined, maintenantMs: number): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return '';
  const jour = (x: number) => new Date(x + 3_600_000).toISOString().slice(0, 10);
  const j = jour(t);
  const auj = jour(maintenantMs);
  if (j === auj) { const h = new Date(t + 3_600_000).toISOString(); return `${Number(h.slice(11, 13))} h ${h.slice(14, 16)}`; }
  const ecart = Math.round((Date.parse(`${auj}T00:00:00Z`) - Date.parse(`${j}T00:00:00Z`)) / 86_400_000);
  if (ecart === 1) return 'Hier';
  if (ecart > 1 && ecart < 7) return ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(`${j}T12:00:00Z`).getUTCDay()];
  return `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;
}
