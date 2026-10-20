import { estSansReponse, idDeLAvis, type AvisAvecReponse, type BrouillonDAvis, type BrouillonsDAvis } from './ia-avis-pur';

/* ══ UN AVIS GOOGLE, SA CLIENTE — 20 octobre 2026 ═══════════════════════
   « J'aimerais à partir d'aujourd'hui lier un avis à une fiche » (Yéman).
   Maquette DNVVXdkd… validée (« Tout me va »), réponses au sélecteur : le
   Trône PROPOSE la fiche, la Maison confirme d'un toucher (« C'est elle »,
   « Une autre fiche », « Aucune fiche ») ; rien ne se relie seul.

   LA FICHE PROPOSÉE. Depuis août, la Maison demande un avis par WhatsApp
   après la première facture réglée de chaque tête (`avis-google`, envoi
   `env-<facture>-wa-avis`, type « avis-google », avec la fiche). Un avis
   qui arrive se rapproche donc des clientes à qui la demande est partie
   dans les 30 jours d'avant, et qui portent le même prénom que sur Google.
   Sinon, des clientes venues (rituel honoré) dans les 30 jours d'avant.
   Trois propositions au plus, la demande d'abord.

   À PARTIR D'AUJOURD'HUI. Un avis publié avant le 20 octobre 2026 ne
   reçoit pas de proposition ; « Relier à une fiche » reste possible à la
   main. La date vient de Google (`publieLe`, gardé par le relevé depuis sa
   version 2026-10-20-b) ; sans elle, elle s'estime sur « il y a 3 jours »
   au jour du relevé.

   Le lien reste au Trône : Claude ne lit jamais la fiche, et la réponse
   publique ne dit rien de la cliente.

   PUR : aucun écran, aucun réseau, aucun magasin. */

/** Le jour où l'on commence à relier (sa demande, le 20 octobre 2026). */
export const DEPART_DES_LIENS = '2026-10-20';
/** La demande d'avis compte si elle est partie dans les 30 jours d'avant. */
export const JOURS_DE_LA_DEMANDE = 30;
/** À défaut, une venue (rituel honoré) dans les 30 jours d'avant. */
export const JOURS_DE_LA_VENUE = 30;
/** Trois fiches proposées au plus. */
export const PROPOSITIONS_MAX = 3;
/** Le document des liens, dans `documents` : le Trône seul l'écrit. */
export const CLE_DES_LIENS = 'mnd_avis_fiches';

/** Un avis tel que le relevé le pose : ce que lit la réponse, plus le jour
    où Google l'a publié et sa référence chez Google (version 2026-10-20-b). */
export type AvisDuReleve = AvisAvecReponse & { publieLe?: string; ref?: string };

/** Ce que le Trône garde par avis : la fiche reliée, ou « aucune fiche »,
    qui l'a dit et quand. */
export type LienDAvis = { clientId?: string; sansFiche?: boolean; par?: string; le: string };
export type LiensDesAvis = Record<string, LienDAvis>;

/** Ce que les règles lisent des fiches, des envois et des rendez-vous. */
export type FicheLue = { id: string; name: string; phone?: string };
export type EnvoiLuPourLesAvis = { type: string; clientId?: string; quand: string; statut?: string };
export type RdvLuPourLesAvis = { clientId: string; date: string; status: string };

/* ── LE JOUR ───────────────────────────────────────────────────────────── */

/** Le jour d'un instant à Cotonou (UTC+1 toute l'année, sans heure d'été). */
export function jourACotonou(iso: string | undefined | null): string | null {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return null;
  return new Date(t + 3_600_000).toISOString().slice(0, 10);
}

/** Un jour (AAAA-MM-JJ) décalé de n jours, à midi UTC : aucun fuseau ne le fait sauter. */
export function jourDecaleDe(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const UNITES: Record<string, number> = { minute: 60_000, heure: 3_600_000, jour: 86_400_000, semaine: 7 * 86_400_000, mois: 30 * 86_400_000, an: 365 * 86_400_000 };

/** LE JOUR D'UN AVIS : celui que Google donne (`publieLe`) ; sinon estimé
    sur « il y a 3 jours » au moment du relevé ; sinon `null`. */
export function jourDeLAvis(a: Pick<AvisDuReleve, 'publieLe' | 'quand'>, releveLe: string | undefined): string | null {
  const donne = jourACotonou(a.publieLe);
  if (donne) return donne;
  const base = Date.parse(String(releveLe ?? ''));
  if (!Number.isFinite(base)) return null;
  const q = String(a.quand ?? '').trim().toLowerCase();
  if (!q) return null;
  if (/à l[’']instant|aujourd[’']hui|maintenant/.test(q)) return jourACotonou(new Date(base).toISOString());
  if (/\bhier\b/.test(q)) return jourACotonou(new Date(base - UNITES.jour).toISOString());
  const m = q.match(/il y a\s+(\d+|une?|quelques)\s+(minute|heure|jour|semaine|mois|an)/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === 'quelques' ? 3 : 1;
  return jourACotonou(new Date(base - n * UNITES[m[2]]).toISOString());
}

/** Publié le 20 octobre 2026 ou après : l'avis reçoit une proposition. */
export function estDepuisLeDepart(a: Pick<AvisDuReleve, 'publieLe' | 'quand'>, releveLe: string | undefined): boolean {
  const j = jourDeLAvis(a, releveLe);
  return j !== null && j >= DEPART_DES_LIENS;
}

/* ── LES NOMS ──────────────────────────────────────────────────────────── */

/** Les mots d'un nom, sans accent ni majuscule : « Sènami D. » donne
    ["senami", "d"]. Les initiales restent (une lettre), on les trie après. */
export function motsDuNom(s: string | undefined | null): string[] {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/** Le prénom que Google montre, prêt à comparer : le premier mot de deux
    lettres au moins. « A. Dossou » n'a pas de prénom lisible : rien. */
export function prenomCompare(auteur: string | undefined | null): string {
  const mots = motsDuNom(auteur);
  return mots[0] && mots[0].length >= 2 ? mots[0] : '';
}

/* ── LA FICHE PROPOSÉE ─────────────────────────────────────────────────── */

export type FicheProposee = {
  clientId: string;
  nom: string;
  /** « demande » : la demande d'avis lui est partie ; « venue » : elle est venue. */
  raison: 'demande' | 'venue';
  /** Le jour de cette demande ou de cette venue. */
  le: string;
  /** Le reste du nom Google (nom ou initiale) tient aussi : plus sûr. */
  nomAussi: boolean;
};

/** Une demande d'avis qui a pu lui parvenir : partie, ou passée par la main. */
const DEMANDE_PARTIE = new Set(['envoyé', 'à-la-main']);

/** Le reste du nom Google tient-il ? « Mireille Agossou » contre la fiche
    « Mireille AGOSSOU » : oui ; « Mireille A. » contre elle : oui (initiale). */
function resteDuNomTient(auteur: string, nomDeLaFiche: string): boolean {
  const reste = motsDuNom(auteur).slice(1);
  if (reste.length === 0) return false;
  const fiche = motsDuNom(nomDeLaFiche);
  return reste.every((m) => (m.length === 1 ? fiche.some((f) => f.startsWith(m)) : fiche.includes(m)));
}

/** LES FICHES PROPOSÉES pour un avis : même prénom sur la fiche, et une
    demande d'avis partie dans les 30 jours d'avant (sinon une venue dans
    les 30 jours d'avant). La demande d'abord, puis le nom qui tient aussi,
    puis la plus récente. Trois au plus ; rien sans prénom lisible. */
export function fichesProposees(
  a: Pick<AvisDuReleve, 'auteur' | 'publieLe' | 'quand'>,
  releveLe: string | undefined,
  o: { clients: readonly FicheLue[]; envois: readonly EnvoiLuPourLesAvis[]; rdvs: readonly RdvLuPourLesAvis[] },
): FicheProposee[] {
  const prenom = prenomCompare(a.auteur);
  if (!prenom) return [];
  const jour = jourDeLAvis(a, releveLe) ?? jourACotonou(releveLe);
  if (!jour) return [];
  const debutDemande = jourDecaleDe(jour, -JOURS_DE_LA_DEMANDE);
  const debutVenue = jourDecaleDe(jour, -JOURS_DE_LA_VENUE);

  const props: FicheProposee[] = [];
  for (const c of o.clients) {
    if (!c?.id || !motsDuNom(c.name).includes(prenom)) continue;
    let demande: string | null = null;
    for (const e of o.envois) {
      if (e.type !== 'avis-google' || e.clientId !== c.id || !DEMANDE_PARTIE.has(String(e.statut ?? ''))) continue;
      const j = jourACotonou(e.quand);
      if (j && j >= debutDemande && j <= jour && (!demande || j > demande)) demande = j;
    }
    let venue: string | null = null;
    if (!demande) {
      for (const r of o.rdvs) {
        if (r.clientId !== c.id || r.status !== 'honoré') continue;
        if (r.date >= debutVenue && r.date <= jour && (!venue || r.date > venue)) venue = r.date;
      }
    }
    if (!demande && !venue) continue;
    props.push({ clientId: c.id, nom: c.name, raison: demande ? 'demande' : 'venue', le: (demande ?? venue) as string, nomAussi: resteDuNomTient(a.auteur, c.name) });
  }
  return props
    .sort((x, y) => (x.raison === y.raison ? 0 : x.raison === 'demande' ? -1 : 1)
      || Number(y.nomAussi) - Number(x.nomAussi)
      || (x.le < y.le ? 1 : x.le > y.le ? -1 : 0))
    .slice(0, PROPOSITIONS_MAX);
}

/** « demande d'avis partie le 19 oct. 2026 · même prénom ». Le jour se dit
    par la fonction qu'on lui passe (l'écran a la sienne, avec l'année). */
export function pourquoiProposee(p: FicheProposee, jourDit: (jour: string) => string): string {
  const quoi = p.raison === 'demande' ? `demande d’avis partie le ${jourDit(p.le)}` : `venue le ${jourDit(p.le)}, sans demande d’avis`;
  return `${quoi} · ${p.nomAussi ? 'même prénom, même nom' : 'même prénom'}`;
}

/* ── L'ÉTAT D'UN AVIS ──────────────────────────────────────────────────── */

export type EtatDuLien = 'reliee' | 'sans-fiche' | 'a-relier' | 'ancien';

/** Reliée, « aucune fiche » dit par la Maison, à relier (depuis le 20
    octobre 2026), ou ancien (avant : rien n'est proposé). */
export function etatDuLien(a: AvisDuReleve, lien: LienDAvis | undefined, releveLe: string | undefined): EtatDuLien {
  if (lien?.clientId) return 'reliee';
  if (lien?.sansFiche) return 'sans-fiche';
  return estDepuisLeDepart(a, releveLe) ? 'a-relier' : 'ancien';
}

export const compteARelier = (avis: readonly AvisDuReleve[], liens: LiensDesAvis, releveLe: string | undefined): number =>
  avis.filter((a) => etatDuLien(a, liens[idDeLAvis(a)], releveLe) === 'a-relier').length;

/** LE FILTRE DE L'ONGLET, et le résumé de chaque ligne : les mêmes juges. */
export type FiltreDesAvis = 'tous' | 'sans' | 'relier' | 'repondus';
export function passeLeFiltre(
  a: AvisDuReleve, f: FiltreDesAvis, b: BrouillonDAvis | undefined, lien: LienDAvis | undefined, releveLe: string | undefined,
): boolean {
  if (f === 'sans') return estSansReponse(a, b);
  if (f === 'repondus') return !estSansReponse(a, b);
  if (f === 'relier') return etatDuLien(a, lien, releveLe) === 'a-relier';
  return true;
}

/** Combien dans chaque filtre : le même juge que la liste. */
export function compteParFiltre(
  avis: readonly AvisDuReleve[], brouillons: BrouillonsDAvis, liens: LiensDesAvis, releveLe: string | undefined,
): Record<FiltreDesAvis, number> {
  const n = (f: FiltreDesAvis) => avis.filter((a) => passeLeFiltre(a, f, brouillons[idDeLAvis(a)], liens[idDeLAvis(a)], releveLe)).length;
  return { tous: avis.length, sans: n('sans'), relier: n('relier'), repondus: n('repondus') };
}

/** Les avis reliés à une cliente, le plus récent d'abord : la fiche les montre. */
export function avisDeLaCliente(clientId: string, avis: readonly AvisDuReleve[], liens: LiensDesAvis, releveLe: string | undefined): AvisDuReleve[] {
  if (!clientId) return [];
  return avis
    .filter((a) => liens[idDeLAvis(a)]?.clientId === clientId)
    .sort((x, y) => String(jourDeLAvis(y, releveLe) ?? '').localeCompare(String(jourDeLAvis(x, releveLe) ?? '')));
}

/** LA RECHERCHE « Une autre fiche » : chaque mot tapé commence un mot du
    nom, ou les chiffres tapés (quatre au moins) sont dans le numéro. */
export function chercheDesFiches(q: string, clients: readonly FicheLue[], max = 6): FicheLue[] {
  const mots = motsDuNom(q);
  const chiffres = String(q ?? '').replace(/\D/g, '');
  if (mots.length === 0 && chiffres.length < 4) return [];
  return clients.filter((c) => {
    if (chiffres.length >= 4 && String(c.phone ?? '').replace(/\D/g, '').includes(chiffres)) return true;
    if (mots.length === 0) return false;
    const nom = motsDuNom(c.name);
    return mots.every((m) => nom.some((n) => n.startsWith(m)));
  }).slice(0, max);
}
