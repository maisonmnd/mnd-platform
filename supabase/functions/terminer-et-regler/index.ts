// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* terminer-et-regler — la cliente termine elle-même et règle depuis son
 * téléphone (6 novembre 2026).
 *
 * « Une cliente qui a pris rendez-vous toute seule sur le logiciel hier,
 * j'aimerais lui donner la possibilité de terminer son rendez-vous toute
 * seule une fois qu'elle finit à la Maison MND et de pouvoir passer régler
 * son RDV dans la Couronne » (Yéman). Trois portes mènent au MÊME règlement,
 * celui de la fonction `regler-la-seance` (la page « Régler », KkiaPay) :
 *
 *   retrouver — le site, « Retrouver mon rendez-vous » : son code de
 *               confirmation ET les 4 derniers chiffres du numéro auquel la
 *               Maison a confirmé. Le code seul n'ouvre rien ; la recherche
 *               est bornée aux rendez-vous proches ; un code inconnu et des
 *               chiffres faux reçoivent la même réponse, après le même
 *               travail ; les essais répétés sont freinés (par adresse, et
 *               par code d'où qu'ils viennent). Trouvé : le jeton signé de
 *               la page /rdv/ et ce que le billet dit du règlement.
 *   billet    — la page /rdv/?v=<jeton signé> : ce qui reste à régler et si
 *               la porte « Terminer et régler » est ouverte. Rien d'elle que
 *               son prénom.
 *   terminer  — elle déclare avoir terminé : par le jeton signé (le site),
 *               par son compte (Ma Couronne, sa propre fiche seulement), ou
 *               par la clé de service (le WhatsApp de la Maison, qui a
 *               reconnu son numéro). La règle juge la porte (l'heure du
 *               rituel, le jour même, jusqu'à minuit à Cotonou ; jamais un
 *               annulé, un déjà réglé, un couvert sans reste ; « Passe au
 *               comptoir »). Ouverte : la marque `termineParElle` se pose
 *               (une fois), le lien de règlement se pose ou se relit, le
 *               personnel est prévenu (une fois), et l'adresse de règlement
 *               revient. Le rendez-vous ne passe PAS honoré ici : il le
 *               devient quand elle a réglé (regler-la-seance).
 *
 * LA PIÈCE ne s'écrit pas ici : le serveur ne lit pas le tarif d'une tête.
 * Un poste du Trône ouvert l'écrit dès la marque (la main du Trône, comme
 * pour Grenat), et la page « Régler » la relit. Le montant rendu ici est le
 * reste de sa pièce quand elle existe, sinon celui du prix figé, sinon rien.
 *
 * Verify JWT : ÉTEINT (le site n'a pas de compte ; la porte est jugée ici).
 * Secrets : aucun à poser. SERVICE_KEY (ou CLE_SERVICE) et
 * SUPABASE_SERVICE_ROLE_KEY, qui signe les jetons de /rdv/ comme dans
 * demande-submit et confirmation-rdv, sont déjà sur le projet.
 *
 * Déploiement : `node scripts/mise-en-ligne.mjs fonction terminer-et-regler
 * --commit <sha> --jwt non`. Vérifier : un GET rend sa version.
 */

const VERSION = '2026-11-06-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(obj as object) }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ══ LES RÈGLES, recopiées à l'identique du dépôt (une fonction Edge ne lit
   rien de `src/`). `node scripts/terminer-copie-serveur.mjs` les réécrit ;
   le banc des douze lunes (R8) et verifie-terminer-et-regler les comparent. */

/* ⟨lien-du-rdv⟩ */
/** Les adresses fixes des deux boutons du modèle `confirmation_rdv_liens`. */
export const URL_DU_RDV = 'https://maisonmnd.com/rdv/?v=';
export const URL_DE_L_AGENDA = 'https://maisonmnd.com/rdv/agenda/?v=';

/** La référence dite à la cliente : « MND-7K3Q ». Quatre signes tirés d'un
    alphabet sans 0, O, 1 ni I ; la même pour un même rendez-vous, partout
    (l'écran du site, le modèle, la page du rendez-vous, le Trône). */
export const ALPHABET_DE_LA_REFERENCE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PREFIXE_DE_LA_REFERENCE = 'MND-';
export const FORME_DE_LA_REFERENCE = /^MND-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
export function referenceDuRendezVous(apptId: string): string {
  /* FNV-1a sur 32 bits : stable, sans dépendance, suffisant pour une
     référence lue par une personne (le jour et l'heure l'accompagnent). */
  let h = 0x811c9dc5;
  for (const c of String(apptId ?? '')) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let s = '';
  for (let i = 0; i < 4; i++) { s += ALPHABET_DE_LA_REFERENCE[h % 32]; h = Math.floor(h / 32); }
  return `${PREFIXE_DE_LA_REFERENCE}${s}`;
}

/** Le jeton : `<id du rendez-vous>.<22 signes de signature>`. L'identifiant
    ne porte jamais de point ; la signature est HMAC-SHA-256 de « rdv: » +
    identifiant, en base64url, coupée à 22 signes (132 bits). Un seul mot
    de [A-Za-z0-9._-] : c'est ce qu'un bouton de modèle Meta accepte. */
export const FORME_DU_JETON_DU_RDV = /^[A-Za-z0-9_-]{1,120}\.[A-Za-z0-9_-]{22}$/;
const base64url = (octets: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function signe(secret: string, texte: string): Promise<string> {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', cle, enc.encode(texte))).slice(0, 22);
}
export async function jetonDuRendezVous(secret: string, apptId: string): Promise<string> {
  if (!secret || !/^[A-Za-z0-9_-]{1,120}$/.test(apptId)) throw new Error('jeton du rendez-vous : identifiant ou secret impossible');
  return `${apptId}.${await signe(secret, `rdv:${apptId}`)}`;
}
/** L'identifiant du rendez-vous que le jeton désigne, ou null s'il est
    faux, forgé ou mal formé. La comparaison ne s'arrête pas à la première
    différence. */
export async function apptIdDuJeton(secret: string, jeton: unknown): Promise<string | null> {
  const j = String(jeton ?? '');
  if (!secret || !FORME_DU_JETON_DU_RDV.test(j)) return null;
  const i = j.lastIndexOf('.');
  const apptId = j.slice(0, i);
  const attendu = await signe(secret, `rdv:${apptId}`);
  const donne = j.slice(i + 1);
  let diff = attendu.length ^ donne.length;
  for (let k = 0; k < attendu.length; k++) diff |= attendu.charCodeAt(k) ^ donne.charCodeAt(k);
  return diff === 0 ? apptId : null;
}

/* LE MODÈLE DE LA CONFIRMATION, AVEC OU SANS LIENS. `confirmation_rdv`
   (approuvé) : « Bonjour {{1}}, c'est confirmé : votre rendez-vous est
   retenu {{2}}. Nous vous attendons. Merci de nous prévenir en cas
   d'empêchement. » `confirmation_rdv_liens` (à faire approuver, secret
   WA_TEMPLATE_CONF_LIENS) : « Bonjour {{1}}, c'est confirmé : votre
   rendez-vous est retenu {{2}}. Votre référence : {{3}}. Nous vous
   attendons. Pour déplacer ou annuler, touchez le bouton ci-dessous. »,
   puis deux boutons à URL dynamique, « Déplacer ou annuler » et « Ajouter à
   mon agenda », chacun avec le jeton. Tant que le secret n'est pas posé,
   ou si Meta refuse le modèle neuf (#132xxx), l'ancien part. */
export type ConfirmationAEnvoyer = { avecLiens: boolean; prenom: string; quand: string; reference: string; jeton: string };
export function composantsDeLaConfirmation(o: ConfirmationAEnvoyer): unknown[] {
  const corps = [{ type: 'text', text: o.prenom }, { type: 'text', text: o.quand }];
  if (!o.avecLiens) return [{ type: 'body', parameters: corps }];
  return [
    { type: 'body', parameters: [...corps, { type: 'text', text: o.reference }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: o.jeton }] },
    { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: o.jeton }] },
  ];
}
/** Ce que le fil de la Maison montre de la confirmation partie. */
export function texteDeLaConfirmation(o: Pick<ConfirmationAEnvoyer, 'avecLiens' | 'prenom' | 'quand' | 'reference'>): string {
  return o.avecLiens
    ? `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Votre référence : ${o.reference}. Nous vous attendons. Pour déplacer ou annuler, touchez le bouton ci-dessous.`
    : `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`;
}

/** Les mots que la cliente envoie au WhatsApp de la Maison depuis la page
    du rendez-vous : la réception les comprend (déplacer, annuler). */
export const motPourDeplacer = (quand: string, reference: string): string =>
  `Bonjour, je souhaite déplacer mon rendez-vous du ${quand} (réf. ${reference}). Quelles places avez-vous ?`;
export const motPourAnnuler = (quand: string, reference: string): string =>
  `Bonjour, je dois annuler mon rendez-vous du ${quand} (réf. ${reference}). Merci de votre compréhension.`;

/** LE FICHIER .ICS, à l'heure de Cotonou (UTC+1 toute l'année), sans rien
    de plus que ce que l'écran dit. Le site le construit (l'écran Réservé, la
    page /rdv/agenda/) ; le banc le tient. */
export function ficheAgendaICS(o: { apptId: string; date: string; heure: string; dureeMin: number; titre: string; note: string; lieu?: string }): string {
  const [h, m] = o.heure.split(':').map(Number);
  const debut = new Date(Date.UTC(Number(o.date.slice(0, 4)), Number(o.date.slice(5, 7)) - 1, Number(o.date.slice(8, 10)), h, m));
  const fin = new Date(debut.getTime() + Math.max(60, o.dureeMin || 60) * 60_000);
  const t = (d: Date) => `${d.toISOString().slice(0, 10).replace(/-/g, '')}T${d.toISOString().slice(11, 16).replace(':', '')}00`;
  const texte = (s: string) => String(s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maison MND//site//FR', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${o.apptId}@maisonmnd.com`,
    `DTSTAMP:${t(new Date(Date.UTC(Number(o.date.slice(0, 4)), Number(o.date.slice(5, 7)) - 1, Number(o.date.slice(8, 10)))))}Z`,
    `DTSTART;TZID=Africa/Porto-Novo:${t(debut)}`, `DTEND;TZID=Africa/Porto-Novo:${t(fin)}`,
    `SUMMARY:${texte(o.titre)}`, `LOCATION:${texte(o.lieu ?? 'Maison MND · Cotonou')}`, `DESCRIPTION:${texte(o.note)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
/* LE RETOUR D'UNE CLIENTE, EN UN TOUCHER — 3 novembre 2026 (le septième
   changement). Sur le site, « Déjà cliente ? » demande son numéro ; le
   serveur ne dit JAMAIS si le numéro est connu (rien ne se lit en tapant le
   numéro d'une autre) : si la Maison la connaît, le modèle approuvé
   `reservation_preparee` part sur CE WhatsApp, avec ses derniers gestes
   cochés et ce jeton d'identité en quatrième segment du lien `?r=`. La page
   le rend au serveur, qui remplit prénom, nom, civilité et numéro. Sept
   jours, puis le jeton ne vaut plus. */
export const FORME_DU_JETON_D_IDENTITE = /^[A-Za-z0-9_-]{1,80}~\d{8}~[A-Za-z0-9_-]{22}$/;
export const JOURS_DU_JETON_D_IDENTITE = 7;
export const jourCompact = (iso: string): string => String(iso ?? '').slice(0, 10).replace(/-/g, '');
export async function jetonDIdentite(secret: string, clientId: string, valableJusquAuISO: string): Promise<string> {
  const jour = jourCompact(valableJusquAuISO);
  if (!secret || !/^[A-Za-z0-9_-]{1,80}$/.test(clientId) || !/^\d{8}$/.test(jour)) throw new Error('jeton d identité : impossible');
  return `${clientId}~${jour}~${await signe(secret, `identite:${clientId}:${jour}`)}`;
}
/** La fiche que le jeton désigne, ou null : faux, forgé, mal formé, ou passé. */
export async function clientIdDuJetonDIdentite(secret: string, jeton: unknown, aujourdhuiISO: string): Promise<string | null> {
  const j = String(jeton ?? '');
  if (!secret || !FORME_DU_JETON_D_IDENTITE.test(j)) return null;
  const [clientId, jour, donne] = j.split('~');
  if (jour < jourCompact(aujourdhuiISO)) return null;
  const attendu = await signe(secret, `identite:${clientId}:${jour}`);
  let diff = attendu.length ^ donne.length;
  for (let k = 0; k < attendu.length; k++) diff |= attendu.charCodeAt(k) ^ donne.charCodeAt(k);
  return diff === 0 ? clientId : null;
}
/* LE SECRET QUI SIGNE LES DEUX JETONS : celui que la plateforme pose dans
   CHAQUE fonction, le même partout. Les clés de la Maison (CLE_SERVICE,
   SERVICE_KEY) ne se lisent pas dans le même ordre d'une fonction à l'autre ;
   un jeton signé par l'une ne se relirait pas dans l'autre. Le site n'en
   connaît que le nom. */
export const NOM_DU_SECRET_DES_LIENS = 'SUPABASE_SERVICE_ROLE_KEY';

/** Meta refuse le MODÈLE, pas la cliente : pas encore approuvé, en pause,
    désactivé, ou des variables qui ne tombent pas juste (#132000 à #132999).
    Alors l'ancienne confirmation part, le jour même. */
export const refusDuModele = (code: unknown): boolean => {
  const n = Number(code);
  return Number.isInteger(n) && n >= 132000 && n < 133000;
};
/** Ce qu'une confirmation à liens déposée en salle emporte pour le cas où
    Meta refuserait le modèle neuf : l'ancien, ses variables, ses mots. */
export type RepliDuModele = { modele: string; composants: unknown[]; texteAuFil: string };

/** Ce que la page du rendez-vous dit de lui : à venir, passé, annulé. Un
    rendez-vous honoré est passé, même le jour même. */
export type EtatDuRdv = 'a-venir' | 'passe' | 'annule';
export function etatDuRendezVous(r: { date?: string; status?: string }, aujourdhuiISO: string): EtatDuRdv {
  if (r.status === 'annulé') return 'annule';
  if (r.status === 'honoré') return 'passe';
  return String(r.date ?? '') < String(aujourdhuiISO ?? '').slice(0, 10) ? 'passe' : 'a-venir';
}

/** LES COORDONNÉES D'UNE FICHE, POUR LE FORMULAIRE DU SITE : le prénom (le
    premier mot du nom), le reste du nom, la civilité si la fiche la dit
    (jamais supposée), et le numéro coupé en indicatif et chiffres. Un
    numéro d'un pays que la liste ne connaît pas garde tout son « + » et un
    indicatif vide : le formulaire le prend tel quel. */
export const INDICATIFS_DU_RETOUR = ['+229', '+225', '+228', '+226', '+227', '+221', '+237', '+234', '+233', '+241', '+242', '+243', '+33', '+32', '+41', '+44', '+49', '+39', '+34', '+1'];
export function coordonneesDeLaFiche(f: { name?: unknown; civilite?: unknown; auMasculin?: unknown; phone?: unknown }): { prenom: string; nom: string; civilite: string; numero: string; dial: string } {
  const mots = String(f.name ?? '').trim().split(/\s+/).filter(Boolean);
  /* « Au masculin » est l'ancienne marque d'un Monsieur (avant le 2 octobre
     2026) : elle dit la civilité, elle ne la suppose pas. */
  const civilite = f.civilite === 'madame' || f.civilite === 'mademoiselle' || f.civilite === 'monsieur' ? String(f.civilite)
    : f.auMasculin === true ? 'monsieur' : '';
  const brut = String(f.phone ?? '').replace(/[^\d+]/g, '');
  const e164 = brut.startsWith('+') ? brut : brut.startsWith('00') ? `+${brut.slice(2)}` : '';
  const dial = e164 ? (INDICATIFS_DU_RETOUR.find((d) => e164.startsWith(d) && e164.length > d.length + 6) ?? '') : '';
  return {
    prenom: mots[0] ?? '', nom: mots.slice(1).join(' '), civilite,
    numero: dial ? e164.slice(dial.length) : e164 || brut.replace(/\D/g, ''), dial: dial || (e164 ? '' : '+229'),
  };
}

/** LES GESTES DU DERNIER RITUEL, cochés d'avance dans la réservation
    préparée : ceux du rendez-vous honoré ou confirmé le plus récent déjà
    passé (aujourd'hui compris), sinon du prochain. Jamais un annulé ; six au
    plus, comme le formulaire. */
export function gestesDuDernierRituel(rdvs: { date?: string; status?: string; serviceIds?: unknown }[], aujourdhuiISO: string): string[] {
  const jour = String(aujourdhuiISO ?? '').slice(0, 10);
  const vivants = rdvs.filter((r) => r.status !== 'annulé' && Array.isArray(r.serviceIds) && (r.serviceIds as unknown[]).length > 0 && !!r.date);
  const passes = vivants.filter((r) => String(r.date) <= jour).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const avenir = vivants.filter((r) => String(r.date) > jour).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const choisi = passes[0] ?? avenir[0];
  if (!choisi) return [];
  return [...new Set((choisi.serviceIds as unknown[]).map(String).filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g)))].slice(0, 6);
}
/** Le mot du bouton de `reservation_preparee` pour une cliente qui revient :
    le même format que `jetonDuLien` (src/shared/lien-reservation.ts), le
    parcours de l'entretien, le calibre vide, le jeton d'identité en quatrième
    segment. Le banc le relit avec `lienLu`. */
export const jetonDuLienDuRetour = (gestes: string[], identite: string): string =>
  ['entretien', gestes.filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g)).join('~'), '', identite].join('.');
/** Le {{2}} du modèle : les gestes dits, ou la venue quand il n'y en a pas. */
export const gestesDitsDuRetour = (noms: string[]): string => noms.filter(Boolean).join(' et ') || 'votre prochaine venue';
/* ⟨/lien-du-rdv⟩ */

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul
    l'écrit). `pieceLe` : un poste du Trône a réservé l'écriture de sa pièce
    (une écriture conditionnelle, un seul poste la fait). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
/** La marque posée au règlement : le serveur passe « honoré », un poste du
    Trône réserve les suites (`suitesLe`) et les fait, comme au comptoir. */
export type MarqueDeLHonneur = { le: string; suitesLe?: string };
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DE_LA_FIN_MS = 3_600_000;
export const jourDeLaFin = (ms: number): string => new Date(ms + DECALAGE_DE_LA_FIN_MS).toISOString().slice(0, 10);

/** HONORÉ QUAND ELLE A RÉGLÉ. Rend la marque à poser, ou null : elle n'a
    rien déclaré (le chemin d'avant ne bouge pas), le rendez-vous n'est plus
    « confirmé », il reste à régler, ou le rituel est à venir. Un reste
    illisible n'honore jamais. */
export function honneurAuReglement(o: {
  rdv: { status?: string; date?: string; termineParElle?: MarqueDeLaFin | null } | null;
  resteXof: number;
  maintenantMs: number;
}): MarqueDeLHonneur | null {
  const r = o.rdv;
  if (!r || !r.termineParElle || !r.termineParElle.le) return null;
  if (r.status !== 'confirmé') return null;
  const reste = Number(o.resteXof);
  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;
  const jour = String(r.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > jourDeLaFin(o.maintenantMs)) return null;
  return { le: new Date(o.maintenantMs).toISOString() };
}
/* ⟨/honneur-au-reglement⟩ */

/* ⟨terminer-et-regler⟩ */
/** Le rendez-vous tel que la règle le lit. */
export type RdvDeLaFin = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; numeroAPrevenir?: string;
  priceXof?: unknown; seriesIndex?: number; forfait?: { totalXof?: number } | null;
  discountPct?: number; discountXof?: number;
  payments?: { amountXof?: number }[]; paidXof?: number;
  depositXof?: number; depositConfirmed?: boolean; coveredBySub?: boolean;
  termineParElle?: MarqueDeLaFin | null; honoreAuReglement?: MarqueDeLHonneur | null;
  lienDeReglement?: { jeton?: string; creeLe?: string } | null;
  lienDuFoyer?: { jeton?: string; apptIds?: string[]; creeLe?: string } | null;
};

/** L'instant du rituel, à l'heure de Cotonou ; NaN si la date ou l'heure ne se lisent pas. */
export function instantDuRituel(date: unknown, time: unknown): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  const h = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!d || !h) return NaN;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2])) - DECALAGE_DE_LA_FIN_MS;
}

/** Le prix net d'un rendez-vous au prix FIGÉ, la lecture d'`apptNetXof` :
    séance de suite à zéro, forfait, prix moins la remise du rendez-vous.
    Sans prix figé : `undefined`. Le serveur ne devine pas le tarif d'une tête. */
export function prixFigeDeLaFin(a: Pick<RdvDeLaFin, 'priceXof' | 'seriesIndex' | 'forfait' | 'discountPct' | 'discountXof'>): number | undefined {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0));
  if (typeof a.priceXof !== 'number' || !Number.isFinite(a.priceXof)) return undefined;
  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));
}

/** L'argent déjà reçu sur le rendez-vous : le journal des versements, sinon
    `paidXof`, et l'acompte seulement s'il est reconnu reçu. */
export const argentRecuDeLaFin = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'depositXof' | 'depositConfirmed'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0)
  + (a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0);

/** Ce qui reste dû, quand le prix est figé ; null sinon. */
export function resteConnuDeLaFin(a: RdvDeLaFin): number | null {
  const prix = prixFigeDeLaFin(a);
  return prix === undefined ? null : Math.max(0, prix - argentRecuDeLaFin(a));
}

/* LA PIÈCE, telle que la fonction la relit : les calculs de finance.ts, que
   regler-la-seance-pur.ts porte déjà (le banc les rejoue côte à côte). */
export type PieceDeLaFin = {
  id: string; kind?: string; status?: string; date?: string; apptId?: string;
  lines?: { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number }[];
  globalDiscountPct?: number; globalDiscountXof?: number; payments?: { amountXof?: number }[];
};
const nombreDeLaFin = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
export function resteDeLaPieceDeLaFin(p: PieceDeLaFin): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + Math.max(0, nombreDeLaFin(l.qty) * nombreDeLaFin(l.unitXof) * (1 - nombreDeLaFin(l.discountPct) / 100) - nombreDeLaFin(l.discountXof)), 0);
  const total = Math.max(0, Math.round(sous * (1 - nombreDeLaFin(p.globalDiscountPct) / 100)) - nombreDeLaFin(p.globalDiscountXof));
  const regle = p.payments && p.payments.length > 0 ? p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : p.status === 'payée' ? total : 0;
  return Math.max(0, total - regle);
}
/** La pièce du rendez-vous : une facture qui porte son identifiant, jamais
    annulée ; celle qui doit encore d'abord, puis la plus récente. */
export function pieceDuRdvDeLaFin<P extends PieceDeLaFin>(pieces: readonly P[], rdvId: string): P | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b) > 0 ? 1 : 0) - (resteDeLaPieceDeLaFin(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}

/** Pourquoi la porte est ouverte, ou fermée. */
export type RaisonDeLaPorte =
  | 'ouverte' | 'introuvable' | 'annule' | 'deja-regle' | 'rien-a-regler' | 'clos' | 'pas-confirme'
  | 'pas-encore-le-jour' | 'jour-passe' | 'avant-l-heure' | 'comptoir';

/** LA PORTE : dès l'heure du rituel, le jour même, jusqu'à minuit à Cotonou.
    `piece` : le reste de SA pièce quand elle existe (elle fait foi) ; sans
    pièce, le reste ne se connaît que si le prix est figé. Un rendez-vous
    honoré sans pièce ouverte a été clos au comptoir. Ce qui est dit d'abord :
    annulé, déjà réglé ; puis le jour et l'heure ; puis « Passe au comptoir ». */
export function porteDeLaFin(o: {
  rdv: RdvDeLaFin | null;
  maintenantMs: number;
  passeAuComptoir?: boolean;
  piece?: { resteXof: number } | null;
}): { ouverte: boolean; raison: RaisonDeLaPorte } {
  const ferme = (raison: RaisonDeLaPorte) => ({ ouverte: false, raison });
  const r = o.rdv;
  if (!r) return ferme('introuvable');
  if (r.status === 'annulé') return ferme('annule');
  if (o.piece) {
    const reste = Number(o.piece.resteXof);
    if (!Number.isFinite(reste)) return ferme('clos');
    if (Math.round(reste) <= 0) return ferme('deja-regle');
  } else if (r.status === 'honoré') {
    return ferme('clos');
  } else if (r.coveredBySub) {
    return ferme('rien-a-regler');
  } else {
    const connu = resteConnuDeLaFin(r);
    if (connu !== null && connu <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler');
  }
  if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');
  const jour = String(r.date ?? '').slice(0, 10);
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return ferme('introuvable');
  if (jour > aujourdhui) return ferme('pas-encore-le-jour');
  if (jour < aujourdhui) return ferme('jour-passe');
  const debut = instantDuRituel(jour, r.time);
  if (!Number.isFinite(debut) || o.maintenantMs < debut) return ferme('avant-l-heure');
  if (o.passeAuComptoir === true) return ferme('comptoir');
  return { ouverte: true, raison: 'ouverte' };
}

/** UNE DÉCLARATION QUI TIENT : la marque date du jour du rituel, à partir de
    son heure. Le Trône la relit avant d'écrire une pièce : une marque posée
    hors de la porte (une écriture qui ne vient pas du serveur) ne vaut rien. */
export function finValable(r: Pick<RdvDeLaFin, 'date' | 'time' | 'status' | 'termineParElle'> | null): boolean {
  const le = Date.parse(String(r?.termineParElle?.le ?? ''));
  if (!r || !Number.isFinite(le) || r.status === 'annulé') return false;
  const debut = instantDuRituel(r.date, r.time);
  return Number.isFinite(debut) && le >= debut && jourDeLaFin(le) === String(r.date ?? '').slice(0, 10);
}

/* ── RETROUVER SON RENDEZ-VOUS : LE CODE ET LES QUATRE CHIFFRES ─────────── */

/** L'alphabet de la référence « MND-7K3Q » (lien-du-rdv-pur.ts ; le banc compare). */
export const SIGNES_DU_CODE_DE_LA_FIN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Le code tel qu'elle le tape : « mnd 7k3q », « MND-7K3Q », « 7k3q ». Rend
    « MND-7K3Q », ou null si ce n'est pas un code. */
export function codeLu(saisie: unknown): string | null {
  const s = String(saisie ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corps = s.length === 7 && s.startsWith('MND') ? s.slice(3) : s.length === 4 ? s : '';
  if (corps.length !== 4 || [...corps].some((c) => !SIGNES_DU_CODE_DE_LA_FIN.includes(c))) return null;
  return `MND-${corps}`;
}
/** Quatre chiffres, ni plus ni moins. */
export function quatreChiffresLus(saisie: unknown): string | null {
  const c = String(saisie ?? '').replace(/\D/g, '');
  return c.length === 4 ? c : null;
}
/** Les quatre derniers chiffres d'un vrai numéro (huit chiffres au moins). */
export function finDuNumero(numero: unknown): string {
  const c = String(numero ?? '').replace(/\D/g, '');
  return c.length >= 8 ? c.slice(-4) : '';
}

/** LES RENDEZ-VOUS PROCHES : d'hier à l'horizon de la réservation. Un code à
    quatre signes n'est ni secret ni unique : on ne cherche jamais plus loin. */
export const JOURS_AVANT_DE_LA_RECHERCHE = 1;
export const JOURS_APRES_DE_LA_RECHERCHE = 100;
export function fenetreDeLaRecherche(maintenantMs: number): { du: string; au: string } {
  const jour = 86_400_000;
  return { du: jourDeLaFin(maintenantMs - JOURS_AVANT_DE_LA_RECHERCHE * jour), au: jourDeLaFin(maintenantMs + JOURS_APRES_DE_LA_RECHERCHE * jour) };
}

/** LE RENDEZ-VOUS DU CODE ET DES CHIFFRES, ou null. Le code seul n'ouvre
    rien ; les chiffres seuls non plus. Chaque rendez-vous est comparé en
    entier (code ET chiffres), trouvé ou non : la réponse et le travail sont
    les mêmes pour un code inconnu et pour des chiffres faux. Plusieurs
    rendez-vous qui répondent (deux venues de la même tête) : le plus proche
    de maintenant, un rendez-vous vivant avant un annulé. */
export function retrouveLeRdv<T extends { id: string; date?: string; time?: string; status?: string }>(o: {
  code: unknown; chiffres: unknown; rdvs: readonly T[];
  referenceDe: (rdvId: string) => string;
  numerosDe: (rdv: T) => readonly (string | undefined)[];
  maintenantMs: number;
}): T | null {
  const code = codeLu(o.code);
  const chiffres = quatreChiffresLus(o.chiffres);
  const f = fenetreDeLaRecherche(o.maintenantMs);
  const trouves: T[] = [];
  for (const r of o.rdvs) {
    const jour = String(r.date ?? '').slice(0, 10);
    const proche = jour >= f.du && jour <= f.au;
    const memeCode = code !== null && o.referenceDe(r.id) === code;
    const memesChiffres = chiffres !== null && o.numerosDe(r).some((n) => finDuNumero(n) === chiffres);
    if (proche && memeCode && memesChiffres) trouves.push(r);
  }
  if (!trouves.length) return null;
  const ecart = (r: T) => {
    const t = instantDuRituel(r.date, r.time);
    return Number.isFinite(t) ? Math.abs(t - o.maintenantMs) : Number.MAX_SAFE_INTEGER;
  };
  return [...trouves].sort((a, b) => (a.status === 'annulé' ? 1 : 0) - (b.status === 'annulé' ? 1 : 0) || ecart(a) - ecart(b) || a.id.localeCompare(b.id))[0];
}

/** LE FREIN AUX ESSAIS RÉPÉTÉS. Par adresse : dix recherches en dix minutes.
    Par code : cinq échecs dans l'heure, douze dans la journée, d'où qu'ils
    viennent (dix mille combinaisons de chiffres ne s'essaient pas). */
export const FREIN_DE_LA_RECHERCHE = { parAdresse: 10, minutesDeLAdresse: 10, echecsParHeure: 5, echecsParJour: 12 } as const;
export function freinDeLaRecherche(o: { essaisDeLAdresse: number; echecsDuCodeDansLHeure: number; echecsDuCodeDuJour: number }): 'libre' | 'adresse' | 'code' {
  if (o.essaisDeLAdresse >= FREIN_DE_LA_RECHERCHE.parAdresse) return 'adresse';
  if (o.echecsDuCodeDansLHeure >= FREIN_DE_LA_RECHERCHE.echecsParHeure || o.echecsDuCodeDuJour >= FREIN_DE_LA_RECHERCHE.echecsParJour) return 'code';
  return 'libre';
}

/* ── LE BILLET : ce que la page du rendez-vous dit du règlement ─────────── */

export type EtatDuBillet = 'confirme' | 'en-cours' | 'termine' | 'regle' | 'annule' | 'passe';
export type BilletDeLaFin = {
  reference: string;
  /** Son prénom d'appel, et rien d'autre d'elle. */
  prenom: string;
  jour: string;
  heure: string;
  etat: EtatDuBillet;
  /** Le juste reste, quand le serveur le connaît (sa pièce, sinon son prix figé). */
  resteXof: number | null;
  porte: { ouverte: boolean; raison: RaisonDeLaPorte };
  /** Elle a déclaré avoir terminé : son règlement l'attend. */
  aTermine: boolean;
};
export function billetDeLaFin(o: {
  rdv: RdvDeLaFin; reference: string; prenom: string; maintenantMs: number;
  passeAuComptoir?: boolean; piece?: { resteXof: number } | null;
}): BilletDeLaFin {
  const r = o.rdv;
  const porte = porteDeLaFin({ rdv: r, maintenantMs: o.maintenantMs, passeAuComptoir: o.passeAuComptoir, piece: o.piece });
  const jour = String(r.date ?? '').slice(0, 10);
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  const debut = instantDuRituel(jour, r.time);
  const aTermine = !!r.termineParElle?.le;
  const regle = porte.raison === 'deja-regle';
  const etat: EtatDuBillet = r.status === 'annulé' ? 'annule'
    : regle ? 'regle'
      : (aTermine || (r.status === 'honoré' && porte.ouverte)) && jour === aujourdhui ? 'termine'
        : jour < aujourdhui || r.status === 'honoré' ? 'passe'
          : jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut ? 'en-cours'
            : 'confirme';
  const reste = o.piece ? Math.max(0, Math.round(Number(o.piece.resteXof) || 0)) : r.status === 'annulé' || r.coveredBySub ? null : resteConnuDeLaFin(r);
  return {
    reference: o.reference,
    prenom: String(o.prenom ?? '').trim().split(/\s+/)[0] ?? '',
    jour, heure: String(r.time ?? '').slice(0, 5), etat,
    resteXof: regle ? 0 : reste,
    porte, aTermine,
  };
}

/* ── LE LIEN : celui du règlement qui existe (regler-la-seance-pur.ts) ──── */

/** Le jeton du lien « Régler » : quatorze signes sans ambiguïté, les mêmes
    que `jetonDe` (le banc compare l'alphabet, la longueur et le tirage). */
export const SIGNES_DU_JETON_DE_LA_FIN = '23456789abcdefghjkmnpqrstuvwxyz';
export const LONGUEUR_DU_JETON_DE_LA_FIN = 14;
export function jetonDeLaFin(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON_DE_LA_FIN; i++) t += SIGNES_DU_JETON_DE_LA_FIN[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % SIGNES_DU_JETON_DE_LA_FIN.length];
  return t;
}
export const estUnJetonDeLaFin = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON_DE_LA_FIN && [...s].every((c) => SIGNES_DU_JETON_DE_LA_FIN.includes(c));
/** L'adresse du règlement : payer.html?tg=r-<jeton>, qui ouvre la page « Régler ». */
export const ADRESSE_DU_REGLEMENT_DE_LA_FIN = 'https://maisonmnd.com/trone/payer.html?tg=r-';
export const adresseDuReglementDeLaFin = (jeton: string): string => `${ADRESSE_DU_REGLEMENT_DE_LA_FIN}${jeton}`;

/** LE LIEN À POSER. Un rendez-vous : son jeton, gardé s'il existe (un second
    toucher garde le même lien). Plusieurs (un foyer, un seul numéro) : un
    jeton commun et la liste entière sur chacun, gardé si la liste est la
    même ; une autre liste en tire un neuf. Jamais de lien pour une liste vide. */
export function lienDeLaFin(o: {
  rdvs: readonly Pick<RdvDeLaFin, 'id' | 'lienDeReglement' | 'lienDuFoyer'>[];
  aleas: ArrayLike<number>;
}): { genre: 'seul' | 'foyer'; jeton: string; neuf: boolean; apptIds: string[] } | null {
  const ids = [...new Set(o.rdvs.map((r) => r.id).filter(Boolean))].sort();
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    const deja = o.rdvs.find((r) => r.id === ids[0])?.lienDeReglement?.jeton;
    return estUnJetonDeLaFin(deja) ? { genre: 'seul', jeton: deja, neuf: false, apptIds: ids } : { genre: 'seul', jeton: jetonDeLaFin(o.aleas), neuf: true, apptIds: ids };
  }
  const liens = ids.map((id) => o.rdvs.find((r) => r.id === id)?.lienDuFoyer);
  const premier = liens[0]?.jeton;
  const memeLien = estUnJetonDeLaFin(premier) && liens.every((l) => !!l && l.jeton === premier && [...(l.apptIds ?? [])].sort().join('|') === ids.join('|'));
  return memeLien ? { genre: 'foyer', jeton: premier as string, neuf: false, apptIds: ids } : { genre: 'foyer', jeton: jetonDeLaFin(o.aleas), neuf: true, apptIds: ids };
}

/* ── L'ÉQUIPE EST PRÉVENUE DÈS SA DÉCLARATION ───────────────────────────── */

const francsDeLaFin = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const heureDiteDeLaFin = (hhmm: unknown): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? (m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`) : '';
};
const PORTE_DITE_DE_LA_FIN: Record<PorteDeLaFin, string> = { couronne: 'Ma Couronne', site: 'le site', whatsapp: 'WhatsApp' };
/** La notification du personnel : des prénoms, l'heure, la porte, le reste
    quand il est connu. Aucun pronom : la civilité ne se suppose pas. */
export function notificationDeLaFin(o: { prenoms: readonly string[]; heure?: string; porte: PorteDeLaFin; resteXof: number | null }): { titre: string; corps: string; url: string } {
  const qui = [...new Set(o.prenoms.map((p) => String(p ?? '').trim()).filter(Boolean))];
  const noms = qui.length === 0 ? 'Une cliente' : qui.length === 1 ? qui[0] : `${qui.slice(0, -1).join(', ')} et ${qui[qui.length - 1]}`;
  const plusieurs = qui.length > 1;
  const heure = heureDiteDeLaFin(o.heure);
  const reste = o.resteXof !== null && o.resteXof > 0 ? ` Reste ${francsDeLaFin(o.resteXof)}.` : '';
  return {
    titre: `${noms} ${plusieurs ? 'ont terminé leur rituel' : 'a terminé son rituel'}`,
    corps: `${heure ? `Rendez-vous de ${heure}. ` : ''}Règlement en cours depuis son téléphone, par ${PORTE_DITE_DE_LA_FIN[o.porte]}.${reste} Un poste du Trône ouvert prépare sa pièce.`,
    url: '/trone/#/carnet',
  };
}
/* ⟨/terminer-et-regler⟩ */

const SECRET_DES_LIENS = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();

/* ── Les portes ────────────────────────────────────────────────────────── */
const ipOf = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
const jetonDeLaRequete = (req: Request): string => (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
/** La clé de service (le WhatsApp de la Maison) : les longueurs d'abord, jamais une valeur écrite. */
const parLeService = (req: Request): boolean => {
  const recu = jetonDeLaRequete(req);
  if (!recu) return false;
  return [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .some((cle) => !!cle && cle.trim().length === recu.length && cle.trim() === recu);
};

/* ── Le frein, sur la table des limites de débit (0007) : un seau, une clé
      (l'adresse, ou le code), l'instant. ── */
async function combien(seau: string, cle: string, minutes: number): Promise<number> {
  const depuis = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', cle).gte('at', depuis);
  return error ? 0 : (count ?? 0);
}
async function note(seau: string, cle: string): Promise<void> {
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip: cle });
}
async function permis(ip: string, seau: string, plafond: number): Promise<boolean> {
  if ((await combien(seau, ip, 10)) >= plafond) return false;
  await note(seau, ip);
  return true;
}

/* ── La base ───────────────────────────────────────────────────────────── */
type Ligne = { id: string; branch_id?: string; data: any; updated_at?: string };
type Fiche = { name?: string; phone?: string; phone2?: string; passeAuComptoir?: boolean; authUserId?: string };

async function leRdv(id: string): Promise<Ligne | null> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  const { data, error } = await admin.from('appointments').select('id,branch_id,data,updated_at').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Ligne | null) ?? null;
}

/** Les rendez-vous proches, par pages de mille (le plafond de Supabase). */
async function lesRdvsProches(maintenantMs: number): Promise<Ligne[]> {
  const f = fenetreDeLaRecherche(maintenantMs);
  const tous: Ligne[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await admin.from('appointments').select('id,branch_id,data,updated_at')
      .gte('data->>date', f.du).lte('data->>date', f.au).order('id').range(de, de + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Ligne[];
    tous.push(...page);
    if (page.length < 1000) break;
  }
  return tous;
}

async function laFiche(clientId: unknown): Promise<Fiche | null> {
  const id = String(clientId ?? '');
  const { data } = await admin.from('clients').select('data').eq('id', id || 'personne').maybeSingle();
  return (data?.data as Fiche | undefined) ?? null;
}

/** Le reste de SA pièce, ou null si aucune pièce ne porte encore le rendez-vous. */
async function leResteDeLaPiece(rdvId: string): Promise<number | null> {
  const { data, error } = await admin.from('invoices').select('id,data').eq('data->>apptId', rdvId).limit(20);
  if (error) throw new Error(error.message);
  const pieces = ((data ?? []) as { id: string; data: any }[]).map((l) => ({ ...(l.data ?? {}), id: l.id })) as PieceDeLaFin[];
  const sienne = pieceDuRdvDeLaFin(pieces, rdvId);
  return sienne ? resteDeLaPieceDeLaFin(sienne) : null;
}

/** Les numéros auxquels la Maison a pu confirmer ce rendez-vous : celui à
    prévenir, puis ceux de la fiche. */
const numerosDuRdv = (rdv: { numeroAPrevenir?: string }, fiche: Fiche | null): (string | undefined)[] =>
  [rdv.numeroAPrevenir, fiche?.phone, fiche?.phone2];

const rdvLu = (l: Ligne): RdvDeLaFin => ({ ...(l.data ?? {}), id: l.id });

async function leBillet(l: Ligne, maintenantMs: number): Promise<BilletDeLaFin> {
  const rdv = rdvLu(l);
  const [fiche, reste] = await Promise.all([laFiche(rdv.clientId), leResteDeLaPiece(l.id)]);
  return billetDeLaFin({
    rdv, reference: referenceDuRendezVous(l.id), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),
    maintenantMs, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste },
  });
}

/* ══ retrouver : le code ET les quatre chiffres ══════════════════════════ */
async function retrouver(req: Request, b: any) {
  const ip = ipOf(req);
  const code = codeLu(b.code);
  const frein = freinDeLaRecherche({
    essaisDeLAdresse: await combien('fin-retrouver', ip, FREIN_DE_LA_RECHERCHE.minutesDeLAdresse),
    echecsDuCodeDansLHeure: code ? await combien('fin-echec', code, 60) : 0,
    echecsDuCodeDuJour: code ? await combien('fin-echec', code, 24 * 60) : 0,
  });
  if (frein !== 'libre') return json({ ok: false, error: 'trop' }, 429);
  await note('fin-retrouver', ip);

  const maintenant = Date.now();
  const proches = await lesRdvsProches(maintenant);
  const candidats = code ? proches.filter((l) => referenceDuRendezVous(l.id) === code) : [];
  /* Le même travail, trouvé ou non : une fiche est toujours lue. */
  const fiches = new Map<string, Fiche | null>();
  for (const id of candidats.length ? [...new Set(candidats.map((l) => String(l.data?.clientId ?? '')))] : ['']) fiches.set(id, await laFiche(id));
  const trouve = retrouveLeRdv({
    code: b.code, chiffres: b.chiffres, rdvs: candidats.map(rdvLu), referenceDe: referenceDuRendezVous,
    numerosDe: (r) => numerosDuRdv(r, fiches.get(String(r.clientId ?? '')) ?? null), maintenantMs: maintenant,
  });
  const ligne = trouve ? candidats.find((l) => l.id === trouve.id) ?? null : null;
  if (!ligne || !SECRET_DES_LIENS) {
    if (code) await note('fin-echec', code);
    return json({ ok: false, error: 'introuvable' });
  }
  return json({ ok: true, v: await jetonDuRendezVous(SECRET_DES_LIENS, ligne.id), billet: await leBillet(ligne, maintenant) });
}

/* ══ billet : la page /rdv/ relit le règlement ═══════════════════════════ */
async function billet(req: Request, b: any) {
  if (!(await permis(ipOf(req), 'fin-billet', 60))) return json({ ok: false, error: 'trop' }, 429);
  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, b.v);
  const ligne = apptId ? await leRdv(apptId) : null;
  if (!ligne) return json({ ok: false, error: 'lien' });
  return json({ ok: true, billet: await leBillet(ligne, Date.now()) });
}

/* ══ terminer : elle déclare avoir terminé ═══════════════════════════════ */

/** Le compte de la requête (Ma Couronne), ou null. */
async function compteDeLaRequete(req: Request): Promise<string | null> {
  const jeton = jetonDeLaRequete(req);
  if (!jeton || jeton.split('.').length !== 3) return null;
  try {
    const { data } = await admin.auth.getUser(jeton);
    return data?.user?.id ?? null;
  } catch { return null; }
}
/** SA fiche, pas son compte : une fiche adoptée garde l'identifiant du Trône (`authUserId`). */
async function ficheDuCompte(uid: string): Promise<string | null> {
  const { data: meme } = await admin.from('clients').select('id').eq('id', uid).maybeSingle();
  if (meme) return String(meme.id);
  const { data: adoptees } = await admin.from('clients').select('id').eq('data->>authUserId', uid).limit(2);
  return adoptees?.length === 1 ? String(adoptees[0].id) : null;
}

/** ÉCRIRE SUR UNE LIGNE FRAÎCHE, SOUS CONDITION : jamais sur une donnée qui a
    bougé (le Trône écrit les mêmes lignes). Trois essais, puis on renonce. */
async function ecrisLeRdv(id: string, change: (data: any) => any | null): Promise<any | null> {
  for (let essai = 0; essai < 3; essai++) {
    const frais = await leRdv(id);
    if (!frais) return null;
    const neuf = change(frais.data ?? {});
    if (neuf === null) return frais.data;
    let q = admin.from('appointments').update({ data: neuf }).eq('id', id);
    if (frais.updated_at) q = q.eq('updated_at', frais.updated_at);
    const { data, error } = await q.select('id');
    if (error) throw new Error(error.message);
    if ((data ?? []).length > 0) return neuf;
  }
  return null;
}

/** Le personnel est prévenu, une fois : la notification existante (push-notify, mode `staff`). */
async function previensLePersonnel(n: { titre: string; corps: string; url: string }): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
      method: 'POST', signal: AbortSignal.timeout(6000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ mode: 'staff', title: n.titre, body: n.corps, url: n.url }),
    });
  } catch (e) {
    console.error('terminer-et-regler: notification', String((e as Error)?.message ?? e).slice(0, 120));
  }
}

/** Ce qui se dit quand aucune porte ne s'ouvre, dans l'ordre où la Maison le dirait. */
const ORDRE_DES_REFUS: RaisonDeLaPorte[] = ['deja-regle', 'rien-a-regler', 'avant-l-heure', 'comptoir', 'clos'];

async function terminer(req: Request, b: any) {
  const porte: PorteDeLaFin | null = b.porte === 'couronne' || b.porte === 'site' || b.porte === 'whatsapp' ? b.porte : null;
  if (!porte) return json({ ok: false, error: 'porte' }, 400);
  let ids: string[] = [];
  if (porte === 'whatsapp') {
    if (!parLeService(req)) return json({ ok: false, error: 'interdit' }, 403);
    ids = (Array.isArray(b.rdvIds) ? b.rdvIds : []).map(String).filter(Boolean).slice(0, 6);
  } else {
    if (!(await permis(ipOf(req), 'fin-terminer', 20))) return json({ ok: false, error: 'trop' }, 429);
    if (porte === 'site') {
      const apptId = await apptIdDuJeton(SECRET_DES_LIENS, b.v);
      if (!apptId) return json({ ok: false, error: 'lien' });
      ids = [apptId];
    } else {
      const uid = await compteDeLaRequete(req);
      const ficheId = uid ? await ficheDuCompte(uid) : null;
      if (!ficheId) return json({ ok: false, error: 'compte' }, 401);
      const ligne = await leRdv(String(b.rdvId ?? ''));
      if (!ligne || String(ligne.data?.clientId ?? '') !== ficheId) return json({ ok: false, error: 'introuvable' }, 404);
      ids = [ligne.id];
    }
  }

  const maintenant = Date.now();
  const tetes: { ligne: Ligne; rdv: RdvDeLaFin; fiche: Fiche | null; reste: number | null; porte: { ouverte: boolean; raison: RaisonDeLaPorte } }[] = [];
  for (const id of [...new Set(ids)]) {
    const ligne = await leRdv(id);
    if (!ligne) continue;
    const rdv = rdvLu(ligne);
    const [fiche, reste] = await Promise.all([laFiche(rdv.clientId), leResteDeLaPiece(id)]);
    tetes.push({
      ligne, rdv, fiche, reste,
      porte: porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } }),
    });
  }
  /* Dans l'ordre de l'heure, comme la page du foyer : la notification et le total suivent cet ordre. */
  tetes.sort((a, b) => `${a.rdv.date ?? ''} ${a.rdv.time ?? ''} ${a.ligne.id}`.localeCompare(`${b.rdv.date ?? ''} ${b.rdv.time ?? ''} ${b.ligne.id}`));
  const ouvertes = tetes.filter((t) => t.porte.ouverte);
  if (ouvertes.length === 0) {
    const raisons = tetes.map((t) => t.porte.raison);
    const etat = tetes.length === 0 ? 'sans-rdv' : (ORDRE_DES_REFUS.find((r) => raisons.includes(r)) ?? raisons[0]);
    const heure = tetes.filter((t) => t.porte.raison === 'avant-l-heure').map((t) => String(t.rdv.time ?? '')).sort()[0];
    return json({ ok: true, etat, ...(etat === 'avant-l-heure' && heure ? { heure } : {}) });
  }

  /* Le lien : celui du rendez-vous, ou un seul pour le foyer. */
  const lien = lienDeLaFin({ rdvs: ouvertes.map((t) => t.rdv), aleas: crypto.getRandomValues(new Uint32Array(LONGUEUR_DU_JETON_DE_LA_FIN)) });
  if (!lien) return json({ ok: false, error: 'lien' }, 500);
  const le = new Date(maintenant).toISOString();
  let neuve = false;
  for (const t of ouvertes) {
    const ecrit = await ecrisLeRdv(t.ligne.id, (d) => {
      const marque = d.termineParElle?.le ? d.termineParElle : { le, par: porte };
      const avecLien = lien.genre === 'seul'
        ? { lienDeReglement: estUnJetonDeLaFin(d.lienDeReglement?.jeton) ? d.lienDeReglement : { ...(d.lienDeReglement ?? {}), jeton: lien.jeton, creeLe: le } }
        : { lienDuFoyer: d.lienDuFoyer?.jeton === lien.jeton ? d.lienDuFoyer : { jeton: lien.jeton, apptIds: lien.apptIds, creeLe: le } };
      if (d.termineParElle?.le && JSON.stringify({ ...d, ...avecLien }) === JSON.stringify(d)) return null;
      if (!d.termineParElle?.le) neuve = true;
      return { ...d, termineParElle: marque, ...avecLien };
    });
    if (ecrit === null) return json({ ok: false, error: 'ecriture' }, 409);
  }
  /* Le jeton qui vaut : celui que porte la ligne (un second toucher, une autre porte). */
  const jeton = lien.genre === 'seul'
    ? String((await leRdv(ouvertes[0].ligne.id))?.data?.lienDeReglement?.jeton ?? lien.jeton)
    : lien.jeton;

  const restes = ouvertes.map((t) => (t.reste !== null ? t.reste : resteConnuDeLaFin(t.rdv)));
  const resteXof = restes.every((r) => r !== null) ? restes.reduce((s: number, r) => s + (r as number), 0) : null;
  const prenoms = ouvertes.map((t) => String(t.fiche?.name ?? t.ligne.data?.clientName ?? '').trim().split(/\s+/)[0] ?? '').filter(Boolean);
  if (neuve) {
    await previensLePersonnel(notificationDeLaFin({ prenoms, heure: String(ouvertes[0].rdv.time ?? ''), porte, resteXof }));
  }
  return json({
    ok: true, etat: 'a-regler', jeton, adresse: adresseDuReglementDeLaFin(jeton), resteXof,
    /* La pièce de chacune existe : la page « Régler » dit le montant tout de suite. */
    piecePrete: ouvertes.every((t) => t.reste !== null),
    prenoms, deja: !neuve,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') {
    return json({ fonction: 'terminer-et-regler', ok: true, secrets: { service: !!SERVICE_KEY, liens: !!SECRET_DES_LIENS } });
  }
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'retrouver') return await retrouver(req, b);
    if (b.action === 'billet') return await billet(req, b);
    if (b.action === 'terminer') return await terminer(req, b);
    return json({ ok: false, error: 'action' }, 400);
  } catch (e) {
    console.error('terminer-et-regler:', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ ok: false, error: 'panne' }, 500);
  }
});
