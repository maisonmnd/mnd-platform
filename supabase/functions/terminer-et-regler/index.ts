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
 *               son prénom, sauf la facture d'un rendez-vous réglé (le nom
 *               et le numéro que porte déjà son PDF).
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
 * LE BILLET RÉGLÉ PORTE SA FACTURE (7 novembre 2026) : « pouvoir
 * télécharger le PDF » d'un rendez-vous passé et réglé (Yéman). Quand SA
 * pièce est soldée avec de l'argent reçu et que le rituel a commencé, le
 * billet (`billet` et `retrouver`) joint `facture` : les seuls champs que
 * le PDF imprime, la tête soignée, la branche, le jour du règlement
 * (billet-regle-pur.ts). Jamais la caisse, la main, le thème, un
 * identifiant. Le site construit le PDF lui-même, avec la règle du Trône.
 * « Mes RDV » remonte douze mois (choix de Yéman, 7 novembre 2026).
 *   avance    — RÉGLER D'AVANCE (7 novembre 2026, « Régler avant et après ») :
 *               Ma Couronne, par son compte, sur SON rendez-vous ou celui
 *               d'une tête qu'elle porte (un mineur de sa famille, la règle
 *               `est_ma_tete`), de sa réservation jusqu'à l'heure du rituel.
 *               La règle (⟨regler-avant-apres⟩) juge : prix figé, reste connu,
 *               pas de formule, pas « Passe au comptoir », pas d'acompte à
 *               vérifier, « confirmé ». Ouverte : le lien de règlement se pose
 *               ou se relit, et son adresse revient avec le reste du serveur.
 *               Le rendez-vous ne bouge pas : il reste « confirmé ».
 *   apres     — RÉGLER APRÈS (7 novembre 2026) : la même porte, dès le
 *               lendemain du rituel, sans limite de temps, sur un rendez-vous
 *               qui doit encore (sa pièce, sinon son prix figé). Jamais honoré.
 *   regler    — RÉGLER DÈS MAINTENANT (7 novembre 2026), la page du rendez-vous :
 *               le jeton signé (le site), la même règle « avance » que Ma
 *               Couronne, le même lien, le même reste entier relu ici. Le
 *               billet (`billet`, `retrouver`) joint `avance` { ouverte,
 *               raison } avant l'heure du rituel : la page n'en tire que son
 *               bouton ou sa phrase. Aucun argent ne bouge ici.
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

const VERSION = '2026-11-07-e · régler dès maintenant depuis la page du rendez-vous (le billet dit si la porte d’avance est ouverte) ; le billet réglé porte sa facture (PDF) ; Mes RDV jusqu’à douze mois ; régler avant et après';

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

/* ⟨reste-du-rdv⟩ */
/* CE QUE LE RENDEZ-VOUS ET SA PIÈCE DISENT DE L'ARGENT. Sorti de
   ⟨terminer-et-regler⟩ le 7 novembre 2026, mot pour mot, pour servir aussi à
   ⟨regler-avant-apres⟩ : régler d'avance ou après coup se juge sur le même
   reste que la porte de la fin. Recopié dans terminer-et-regler et dans
   regler-la-seance. */

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
  /** Elle n'est pas venue (le Trône le marque) : rien ne se règle après coup. */
  absente?: unknown;
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

/** L'ACOMPTE DEMANDÉ QUE LA MAISON N'A PAS ENCORE VÉRIFIÉ (relecture du 6
    novembre 2026) : son montant, ou zéro. Tant que l'équipe ne l'a pas
    reconnu reçu, le serveur ne sait pas ce qu'elle doit vraiment (elle l'a
    peut-être versé) : la porte reste fermée, son règlement se fait au
    comptoir, et le personnel l'apprend. */
export const acompteAVerifier = (r: Pick<RdvDeLaFin, 'depositXof' | 'depositConfirmed'> | null): number =>
  (r && !r.depositConfirmed ? Math.max(0, Math.round(Number(r.depositXof) || 0)) : 0);

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
/* ⟨/reste-du-rdv⟩ */

/* ⟨terminer-et-regler⟩ */
/** Pourquoi la porte est ouverte, ou fermée. */
export type RaisonDeLaPorte =
  | 'ouverte' | 'introuvable' | 'annule' | 'deja-regle' | 'rien-a-regler' | 'clos' | 'pas-confirme'
  | 'pas-encore-le-jour' | 'jour-passe' | 'avant-l-heure' | 'comptoir';

/** LA PORTE : dès l'heure du rituel, le jour même, jusqu'à minuit à Cotonou.
    `piece` : le reste de SA pièce quand elle existe (elle fait foi) ; sans
    pièce, le reste ne se connaît que si le prix est figé. Un rendez-vous
    honoré sans pièce ouverte a été clos au comptoir. Ce qui est dit d'abord :
    annulé, déjà réglé ; puis le jour et l'heure ; puis « Passe au comptoir »
    (la case de la fiche, ou un acompte demandé que la Maison n'a pas vérifié). */
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
  /* Un acompte demandé, pas encore vérifié : le juste reste ne se connaît pas, elle règle au comptoir. */
  if (acompteAVerifier(r) > 0) return ferme('comptoir');
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

/** SUR LA PORTE WHATSAPP SEULEMENT : pendant les vingt premières minutes
    après l'heure du rendez-vous, une phrase libre (« c'est fini », « fini »)
    n'est pas reçue comme une déclaration. Le rituel commence à peine : aucune
    marque ne se pose, et la conversation suit son cours ordinaire. Ma Couronne
    et le site portent un bouton, pas une phrase : elles gardent l'heure du rituel. */
export const ATTENTE_DE_LA_PORTE_WHATSAPP_MS = 20 * 60_000;
export function aPeineCommence(r: Pick<RdvDeLaFin, 'date' | 'time'>, maintenantMs: number): boolean {
  const debut = instantDuRituel(r.date, r.time);
  return Number.isFinite(debut) && maintenantMs >= debut && maintenantMs < debut + ATTENTE_DE_LA_PORTE_WHATSAPP_MS;
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

/** LES RENDEZ-VOUS PROCHES : de douze mois en arrière à l'horizon de la
    réservation. Un code à quatre signes n'est ni secret ni unique : on ne
    cherche jamais plus loin. Douze mois et non plus la veille (choix de
    Yéman, 7 novembre 2026) : « Mes RDV » rend aussi un rituel passé, pour
    qu'une cliente y reprenne sa facture. Le code ET les quatre chiffres,
    et le frein, tiennent la recherche comme avant. */
export const JOURS_AVANT_DE_LA_RECHERCHE = 365;
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
  const dejaRegle = porte.raison === 'deja-regle';
  /* « RÉGLÉ, VOUS POUVEZ PARTIR » NE SE DIT QU'UNE FOIS LE RITUEL COMMENCÉ
     (relecture du 6 novembre 2026). Un rendez-vous À VENIR payé d'avance
     passait « réglé » : la page /rdv/ lui disait de partir et lui retirait
     Déplacer, Annuler et l'agenda. Réglé d'avance, il reste « confirmé »
     (son reste vaut zéro) jusqu'à l'heure de son rituel. */
  const commence = jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);
  const regle = dejaRegle && commence;
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
/** La notification du personnel quand la porte reste fermée pour un acompte
    à vérifier : la cliente a dit avoir terminé, son règlement se fait au
    comptoir. Aucun pronom, comme plus haut. */
export function notificationDeLAcompteAVerifier(o: { prenom: string; heure?: string; acompteXof: number }): { titre: string; corps: string; url: string } {
  const nom = String(o.prenom ?? '').trim() || 'Une cliente';
  const heure = heureDiteDeLaFin(o.heure);
  return {
    titre: `${nom} a terminé son rituel`,
    corps: `${heure ? `Rendez-vous de ${heure}. ` : ''}Acompte de ${francsDeLaFin(o.acompteXof)} demandé, pas encore vérifié : le règlement se fait au comptoir.`,
    url: '/trone/#/carnet',
  };
}
/* ⟨/terminer-et-regler⟩ */

/* ══ LE BILLET RÉGLÉ PORTE SA FACTURE (7 novembre 2026), recopié à
   l'identique de src/shared/billet-regle-pur.ts ; il s'appuie sur les blocs
   qui précèdent. ══ */
/* ⟨billet-regle⟩ */
/** Une ligne de la facture, telle que le PDF la lit. */
export type LigneDeLaFactureDuBillet = { label: string; qty: number; unitXof: number; discountPct: number; discountXof?: number; detail?: string[] };
/** Un versement : son jour, son moyen, sa part, la devise reçue. Ni caisse, ni main, ni trace. */
export type VersementDeLaFactureDuBillet = { date: string; method: string; amountXof: number; fx?: { code: string; rate: number; amount: number } };
export type PieceDeLaFactureDuBillet = {
  number: string; date: string; kind: 'facture';
  lines: LigneDeLaFactureDuBillet[];
  globalDiscountPct: number; globalDiscountXof?: number; discountLabel?: string;
  payments: VersementDeLaFactureDuBillet[];
  payment?: string; fx?: { code: string; rate: number; amount: number };
  tipXof?: number; status: string; master?: string; note?: string;
};
/** La tête soignée (son nom sur le papier, son numéro), celle qui a réglé si
    c'est une autre, et ce que `appelDe` lit pour le mot par défaut. */
export type ClienteDeLaFactureDuBillet = {
  nom: string; payeuse?: string; telephone?: string;
  name: string; civilite?: string; auMasculin?: boolean;
};
/** La branche (son nom, sa ville, sa devise), la raison de la Maison, et le
    premier maître quand la pièce n'en nomme aucun ni ne porte de mot. */
export type MaisonDeLaFactureDuBillet = { nom: string; ville?: string; devise?: string; raison?: string; maitre?: string };
export type FactureDuBillet = {
  piece: PieceDeLaFactureDuBillet;
  cliente: ClienteDeLaFactureDuBillet;
  maison: MaisonDeLaFactureDuBillet;
  /** Le jour du dernier versement. */
  regleLe: string;
};

const nombreDuBillet = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
const texteDuBillet = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined);
const JOUR_DU_BILLET = /^\d{4}-\d{2}-\d{2}$/;

/** Le total de la pièce : les calculs de finance.ts (`invoiceTotal`). */
export function totalDeLaPieceDuBillet(p: PieceDeLaFin): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + Math.max(0, nombreDuBillet(l.qty) * nombreDuBillet(l.unitXof) * (1 - nombreDuBillet(l.discountPct) / 100) - nombreDuBillet(l.discountXof)), 0);
  return Math.max(0, Math.round(sous * (1 - nombreDuBillet(p.globalDiscountPct) / 100)) - nombreDuBillet(p.globalDiscountXof));
}
/** L'argent reçu sur la pièce : ses versements, sinon son total si elle est
    « payée » sans journal (une pièce d'avant le 17 août, `invoiceReglements`). */
export const argentDeLaPieceDuBillet = (p: PieceDeLaFin): number =>
  (p.payments && p.payments.length > 0 ? p.payments.reduce((s, v) => s + nombreDuBillet(v.amountXof), 0) : p.status === 'payée' ? totalDeLaPieceDuBillet(p) : 0);

/** QUAND LE BILLET JOINT SA FACTURE : la pièce du rendez-vous existe, n'est
    ni un devis ni annulée, est soldée avec de l'argent reçu, le rendez-vous
    n'est pas annulé, et son rituel a commencé (un jour passé, ou aujourd'hui
    dès son heure, à Cotonou). Jamais d'avance : un rendez-vous payé d'avance
    garde Déplacer, Annuler et l'agenda jusqu'à son heure. */
export function factureAJoindreAuBillet(o: {
  rdv: { date?: string; time?: string; status?: string };
  piece: PieceDeLaFin | null;
  maintenantMs: number;
}): boolean {
  const p = o.piece;
  if (!p || (p.kind ?? 'facture') !== 'facture' || p.status === 'annulée' || o.rdv.status === 'annulé') return false;
  if (resteDeLaPieceDeLaFin(p) > 0 || argentDeLaPieceDuBillet(p) <= 0) return false;
  const jour = String(o.rdv.date ?? '').slice(0, 10);
  if (!JOUR_DU_BILLET.test(jour)) return false;
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  const debut = instantDuRituel(jour, o.rdv.time);
  return jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);
}

/** Le jour où elle a fini de régler : celui du dernier versement qui porte de
    l'argent, sinon le jour de la pièce. */
export function regleLeDuBillet(p: { date?: unknown; payments?: unknown }): string {
  const jours = (Array.isArray(p.payments) ? p.payments as { date?: unknown; amountXof?: unknown }[] : [])
    .filter((v) => nombreDuBillet(v?.amountXof) > 0)
    .map((v) => String(v?.date ?? '').slice(0, 10))
    .filter((j) => JOUR_DU_BILLET.test(j))
    .sort();
  return jours.length ? jours[jours.length - 1] : String(p.date ?? '').slice(0, 10);
}

/** Les fiches à lire : la tête soignée (`forClientId`, sinon `clientId`), et
    celle qui a réglé quand c'est une autre (un parent pour son enfant). */
export function fichesDeLaFactureDuBillet(p: { clientId?: unknown; forClientId?: unknown }): { tete: string; payeuse: string | null } {
  return {
    tete: String(p.forClientId ?? p.clientId ?? ''),
    payeuse: !p.forClientId || p.forClientId === p.clientId ? null : String(p.clientId ?? ''),
  };
}

const fxDuBillet = (x: unknown): { code: string; rate: number; amount: number } | undefined => {
  const f = x as { code?: unknown; rate?: unknown; amount?: unknown } | null;
  return f && typeof f === 'object' && typeof f.code === 'string' && /^[A-Z]{3}$/.test(f.code) && Number.isFinite(Number(f.rate)) && Number.isFinite(Number(f.amount))
    ? { code: f.code, rate: Number(f.rate), amount: Number(f.amount) } : undefined;
};
/** Ce que la ligne porte, toujours en tableau (la règle de `detailPorte`). */
const detailDuBillet = (d: unknown): string[] => (Array.isArray(d)
  ? d.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  : typeof d === 'string' && d.trim() ? [d.trim()] : []);

/** LA FACTURE QUE LE BILLET PORTE : les seuls champs que le PDF imprime, lus
    un par un dans la pièce (jamais recopiée en bloc), la tête soignée, la
    branche, le jour du règlement. null si la pièce n'a pas de quoi faire un
    papier (sans numéro, sans jour, sans lignes) ou si la branche manque. */
export function factureDuBillet(o: {
  piece: Record<string, unknown>;
  tete: Record<string, unknown> | null;
  payeuse: Record<string, unknown> | null;
  branche: Record<string, unknown> | null;
  raison?: unknown;
}): FactureDuBillet | null {
  const p = o.piece;
  const number = texteDuBillet(p.number);
  const date = String(p.date ?? '').slice(0, 10);
  const nomDeLaBranche = texteDuBillet(o.branche?.name);
  if (!number || !JOUR_DU_BILLET.test(date) || !Array.isArray(p.lines) || p.lines.length === 0 || !nomDeLaBranche) return null;
  const lines: LigneDeLaFactureDuBillet[] = (p.lines as unknown[]).map((brute) => {
    const l = (brute ?? {}) as Record<string, unknown>;
    const remise = nombreDuBillet(l.discountXof);
    const detail = detailDuBillet(l.detail);
    return {
      label: String(l.label ?? ''), qty: nombreDuBillet(l.qty), unitXof: nombreDuBillet(l.unitXof), discountPct: nombreDuBillet(l.discountPct),
      ...(remise !== 0 ? { discountXof: remise } : {}), ...(detail.length > 0 ? { detail } : {}),
    };
  });
  const payments: VersementDeLaFactureDuBillet[] = (Array.isArray(p.payments) ? p.payments as unknown[] : []).map((brut) => {
    const v = (brut ?? {}) as Record<string, unknown>;
    const fx = fxDuBillet(v.fx);
    return { date: String(v.date ?? '').slice(0, 10), method: String(v.method ?? ''), amountXof: nombreDuBillet(v.amountXof), ...(fx ? { fx } : {}) };
  });
  const fx = fxDuBillet(p.fx);
  const remiseGlobale = nombreDuBillet(p.globalDiscountXof);
  const piece: PieceDeLaFactureDuBillet = {
    number, date, kind: 'facture', lines,
    globalDiscountPct: nombreDuBillet(p.globalDiscountPct),
    ...(remiseGlobale !== 0 ? { globalDiscountXof: remiseGlobale } : {}),
    ...(typeof p.discountLabel === 'string' ? { discountLabel: p.discountLabel } : {}),
    payments,
    ...(typeof p.payment === 'string' ? { payment: p.payment } : {}),
    ...(fx ? { fx } : {}),
    ...(nombreDuBillet(p.tipXof) > 0 ? { tipXof: nombreDuBillet(p.tipXof) } : {}),
    status: String(p.status ?? ''),
    ...(typeof p.master === 'string' ? { master: p.master } : {}),
    ...(texteDuBillet(p.note) ? { note: String(p.note) } : {}),
  };
  /* La tête soignée : son nom de fiche, sinon le nom libre de la pièce, sinon
     « Cliente de passage » (`clientNameForPdf`) ; l'appel lit le même nom
     que le Trône (`clientNameOf`). */
  const t = o.tete;
  const libre = typeof p.clientName === 'string' ? p.clientName : undefined;
  const nom = t ? String(t.name ?? '') : (libre?.trim() && libre.trim().toLowerCase() !== 'walk-in' ? libre.trim() : 'Cliente de passage');
  const cliente: ClienteDeLaFactureDuBillet = {
    nom,
    ...(texteDuBillet(o.payeuse?.name) ? { payeuse: String(o.payeuse?.name) } : {}),
    ...(texteDuBillet(t?.phone) ? { telephone: String(t?.phone) } : {}),
    name: t && typeof t.name === 'string' ? t.name : libre ?? 'Walk-in',
    ...(texteDuBillet(t?.civilite) ? { civilite: String(t?.civilite) } : {}),
    ...(t?.auMasculin === true ? { auMasculin: true } : {}),
  };
  const b = o.branche;
  const maitres = Array.isArray(b?.masters) ? b?.masters as unknown[] : [];
  const maison: MaisonDeLaFactureDuBillet = {
    nom: nomDeLaBranche,
    ...(texteDuBillet(b?.city) ? { ville: String(b?.city) } : {}),
    ...(typeof b?.currency === 'string' && /^[A-Z]{3}$/.test(b.currency) ? { devise: b.currency } : {}),
    ...(texteDuBillet(o.raison) ? { raison: String(o.raison) } : {}),
    /* Le premier maître ne sert qu'au mot par défaut : il ne part que si la
       pièce ne nomme aucune main et ne porte aucun mot. */
    ...(typeof p.master !== 'string' && !texteDuBillet(p.note) && typeof maitres[0] === 'string' ? { maitre: maitres[0] as string } : {}),
  };
  return { piece, cliente, maison, regleLe: regleLeDuBillet(p) };
}
/* ⟨/billet-regle⟩ */
/* ⟨regler-avant-apres⟩ */
/* RÉGLER AVANT ET APRÈS, DANS MA COURONNE — 7 novembre 2026.
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman, 7 h 45). Tranché au sélecteur : « Avant
   et après ».

   TROIS MOMENTS, SANS CHEVAUCHEMENT (`momentDuReglement`) :
   · D'AVANCE, de sa réservation jusqu'à l'heure du rituel : « Régler
     d'avance » le prix connu. Le rendez-vous reste « confirmé » : il n'est
     honoré que quand elle vient. Un soin ajouté pendant la séance se règle
     en plus le jour même (la porte de la fin relit le reste).
   · LE JOUR MÊME, dès l'heure : la porte de la fin (⟨terminer-et-regler⟩),
     qui ne change pas.
   · APRÈS, dès le lendemain : un rendez-vous passé qui doit encore reste
     payable, sans limite de temps. Régler après ne pose JAMAIS « honoré » :
     on règle la pièce (ou, sans pièce, le rendez-vous) ; l'honneur reste au
     comptoir, ou à la règle de la fin quand elle avait déclaré avoir terminé.

   LE MONTANT VIENT TOUJOURS DU SERVEUR : le reste de SA pièce quand elle
   existe (elle fait foi), sinon le prix figé moins l'argent déjà reçu
   (⟨reste-du-rdv⟩). Sans pièce, le versement s'inscrit sur le rendez-vous
   (kkia-…, comme tout versement en ligne), sans nommer de pièce : la pièce du
   jour venu le reprend en « Acompte », à sa date, comme la Caisse le fait
   pour l'argent reçu au Carnet. Les noms portent « AvantApres ». */

/** Le moment du règlement : d'avance (avant l'heure du rituel), le jour même
    (dès l'heure, jusqu'à minuit à Cotonou), ou après (un jour d'après). Rien
    quand la date ou l'heure ne se lisent pas. */
export type MomentDuReglement = 'avance' | 'jour-meme' | 'apres';
export function momentDuReglement(r: Pick<RdvDeLaFin, 'date' | 'time'>, maintenantMs: number): MomentDuReglement | null {
  const jour = String(r.date ?? '').slice(0, 10);
  const debut = instantDuRituel(jour, r.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !Number.isFinite(debut)) return null;
  if (maintenantMs < debut) return 'avance';
  return jour < jourDeLaFin(maintenantMs) ? 'apres' : 'jour-meme';
}

/** Pourquoi « Régler d'avance » ou « Régler » (après) est ouvert, ou fermé. */
export type RaisonAvantApres =
  | 'ouverte' | 'introuvable' | 'annule' | 'pas-le-moment' | 'couvert' | 'absente' | 'comptoir'
  | 'pas-confirme' | 'clos' | 'en-preparation' | 'sans-prix' | 'deja-regle' | 'rien-a-regler';
/** `resteXof` : ce qu'elle réglera, quand la porte est ouverte (zéro quand
    tout est réglé) ; `surLaPiece` : il se règle sur sa pièce, sinon sur le
    rendez-vous. */
export type PorteAvantApres = { ouverte: boolean; raison: RaisonAvantApres; resteXof: number | null; surLaPiece: boolean };

/** LA PORTE D'AVANT ET D'APRÈS. Fermée, dans cet ordre : un annulé ; hors de
    son moment ; couvert par une formule ; absente ; « Passe au comptoir » sur
    sa fiche, ou un acompte demandé que la Maison n'a pas vérifié (le juste
    reste ne se connaît pas). Avec une pièce : son reste fait foi (soldée,
    « déjà réglé ») ; le rendez-vous doit être confirmé ou honoré. Sans pièce :
    seulement un rendez-vous « confirmé » (un honoré sans pièce a été clos au
    comptoir), dont elle n'a pas déclaré la fin (sa pièce se prépare au
    Trône), au prix FIGÉ ; sans prix figé, rien ne se devine. */
export function porteAvantApres(o: {
  quand: 'avance' | 'apres';
  rdv: RdvDeLaFin | null;
  maintenantMs: number;
  passeAuComptoir?: boolean;
  piece?: { resteXof: number } | null;
}): PorteAvantApres {
  const ferme = (raison: RaisonAvantApres, resteXof: number | null = null): PorteAvantApres => ({ ouverte: false, raison, resteXof, surLaPiece: false });
  const r = o.rdv;
  if (!r) return ferme('introuvable');
  if (r.status === 'annulé') return ferme('annule');
  if (momentDuReglement(r, o.maintenantMs) !== o.quand) return ferme('pas-le-moment');
  if (r.coveredBySub) return ferme('couvert');
  if (r.absente) return ferme('absente');
  if (o.passeAuComptoir === true || acompteAVerifier(r) > 0) return ferme('comptoir');
  if (o.piece) {
    const reste = Number(o.piece.resteXof);
    if (!Number.isFinite(reste)) return ferme('clos');
    if (Math.round(reste) <= 0) return ferme('deja-regle', 0);
    if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');
    return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: true };
  }
  if (r.status === 'honoré') return ferme('clos');
  if (r.status !== 'confirmé') return ferme('pas-confirme');
  if (r.termineParElle?.le) return ferme('en-preparation');
  const reste = resteConnuDeLaFin(r);
  if (reste === null) return ferme('sans-prix');
  if (Math.round(reste) <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler', 0);
  return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: false };
}

/** SANS PIÈCE, SEULEMENT CE QUE MA COURONNE A OUVERT. La page « Régler » ne
    règle un rendez-vous sans pièce (sur lui-même) que si son lien a été
    ouvert depuis Ma Couronne (`depuisLaCouronne`, posé par la fonction
    terminer-et-regler, que la base garde, 0172). Un lien posé au Trône
    (« Terminer la séance », « Envoyer le lien ») attend sa pièce comme avant :
    une cliente qui l'ouvre dans les secondes où la pièce voyage encore ne
    règle pas deux fois. */
export const ouvertDepuisLaCouronne = (r: { lienDeReglement?: { depuisLaCouronne?: { le?: string } | null } | null } | null): boolean =>
  !!r?.lienDeReglement?.depuisLaCouronne?.le;

/** L'ARGENT VERSÉ SUR LE RENDEZ-VOUS LUI-MÊME : son journal, sinon `paidXof`,
    sans l'acompte (la lecture d'`argentRecuDeLaFin`, l'acompte en moins). La
    base porte la même lecture (`argent_verse_sur_le_rdv`, 0172). */
export const argentVerseSurLeRdv = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0);

/** RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (7 novembre 2026). Un
    rendez-vous qui porte de l'argent versé (en ligne ou au Carnet) ne
    s'annule pas depuis Ma Couronne : aucun remboursement ne part tout seul.
    Elle écrit à la Maison, qui annule au Trône et décide. L'acompte seul ne
    change rien (il reste acquis, comme avant). Déplacer, lui, reste permis :
    le versement suit le rendez-vous. */
export const annulationParElle = (r: Pick<RdvDeLaFin, 'payments' | 'paidXof'> | null): 'permise' | 'ecrire-a-la-maison' =>
  (r && Math.round(argentVerseSurLeRdv(r)) > 0 ? 'ecrire-a-la-maison' : 'permise');

/** UNE TÊTE DE SON FOYER : la fiche d'un mineur de la famille dont elle est
    la payeuse, jamais archivée. La règle de la base (`est_ma_tete`, 0036),
    qui ouvre déjà ces rendez-vous dans Ma Couronne : moins de dix-huit ans
    révolus, une date de naissance lisible (la minorité ne se présume pas). */
export function teteDuCompte(o: {
  parents: readonly string[];
  tete: { familyId?: unknown; birthday?: unknown; archived?: unknown } | null;
  payeur: unknown;
  aujourdhui: string;
}): boolean {
  const t = o.tete;
  const payeur = String(o.payeur ?? '');
  const naissance = String(t?.birthday ?? '').slice(0, 10);
  const jour = /^(\d{4})-(\d{2}-\d{2})$/.exec(String(o.aujourdhui ?? '').slice(0, 10));
  if (!t || !String(t.familyId ?? '') || t.archived === true || t.archived === 'true') return false;
  if (!payeur || !o.parents.includes(payeur) || !jour || !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) return false;
  return naissance > `${Number(jour[1]) - 18}-${jour[2]}`;
}

/** LE VERSEMENT POSÉ SUR LE RENDEZ-VOUS, quand il n'a pas de pièce : celui de
    la transaction vérifiée chez KkiaPay (kkia-…), à sa date, sans nommer de
    pièce (la pièce du jour venu le reprend en « Acompte » ; un versement qui
    nommerait une pièce ferait croire au Trône qu'elle existe), `paidXof` à
    jour, et le lien qui dit quand il a servi. Un rejeu ne double rien. */
export function versementSurLeRdv<R extends Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'lienDeReglement'>>(
  r: R,
  v: { id: string; amountXof: number; date: string; time?: string; method?: string; cashbox?: string; note?: string },
  quand: 'avance' | 'apres',
): R {
  if ((r.payments ?? []).some((x) => (x as { id?: string }).id === v.id)) return r;
  const montant = Math.round(Number(v.amountXof) || 0);
  const dit = quand === 'avance' ? 'D’avance' : 'Après le rituel';
  return {
    ...r,
    paidXof: Math.round(argentVerseSurLeRdv(r)) + montant,
    payments: [...(r.payments ?? []), { id: v.id, amountXof: montant, date: v.date, method: v.method, cashbox: v.cashbox, note: v.note ? `${dit} · ${v.note}` : dit }],
    ...(r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe: `${v.date}T${v.time ?? '00:00'}` } } : {}),
  } as R;
}

/** La date d'une page ou d'une notification : « 12 novembre 2026 », l'année toujours. */
const MOIS_AVANT_APRES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function jourDitAvantApres(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS_AVANT_APRES[Number(m[2]) - 1]} ${m[1]}`;
}
const francsAvantApres = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** LA PAGE « RÉGLER » D'UN RENDEZ-VOUS SANS PIÈCE (d'avance, ou passé au prix
    figé) : la forme de la page qui existe, le total annoncé, ce qui est déjà
    reçu, le reste. Aucun merci pour l'équipe ici : il se donne le jour du
    rituel, sur sa pièce. Aucun nom de maître : la Maison choisit qui
    s'occupe d'elle. Tout réglé : « réglée ». */
export function pageSansPiece(o: {
  rdv: RdvDeLaFin; porte: PorteAvantApres; quand: 'avance' | 'apres';
  prenom: string; reference: string; branchId?: string;
}) {
  const prix = prixFigeDeLaFin(o.rdv) ?? 0;
  const reste = o.porte.ouverte ? Math.max(0, Math.round(o.porte.resteXof ?? 0)) : 0;
  return {
    etat: (o.porte.ouverte && reste > 0 ? 'a-regler' : 'reglee') as 'a-regler' | 'reglee',
    prenom: String(o.prenom ?? '').trim().split(/\s+/)[0] ?? '',
    maitre: '',
    jour: String(o.rdv.date ?? '').slice(0, 10),
    lignes: [{ label: 'Total annoncé', montantXof: prix }],
    totalXof: prix,
    recuXof: Math.round(argentRecuDeLaFin(o.rdv)),
    resteXof: reste,
    pourboire: false,
    reference: o.reference,
    branchId: o.branchId ?? '',
    sansPiece: o.quand,
  };
}

/** LE PERSONNEL L'APPREND, une fois par versement : le prénom, le rituel, le
    montant ; et ce qui dépasse le reste, gardé au registre, à rapprocher.
    Aucun pronom : la civilité ne se suppose pas. */
export function notificationAvantApres(o: { prenom: string; quand: 'avance' | 'apres'; jour: string; heure?: string; montantXof: number; enPlusXof: number }): { titre: string; corps: string; url: string } {
  const nom = String(o.prenom ?? '').trim() || 'Une cliente';
  const h = /^(\d{1,2}):(\d{2})/.exec(String(o.heure ?? ''));
  const heure = h ? (h[2] === '00' ? ` à ${Number(h[1])} h` : ` à ${Number(h[1])} h ${h[2]}`) : '';
  const plus = o.enPlusXof > 0 ? ` ${francsAvantApres(o.enPlusXof)} de plus, gardés au registre : à rapprocher.` : '';
  return {
    titre: o.quand === 'avance' ? `${nom} a réglé d’avance` : `${nom} a réglé un rituel passé`,
    corps: `Rituel du ${jourDitAvantApres(o.jour)}${heure} : ${francsAvantApres(o.montantXof)} en ligne, inscrits sur le rendez-vous.`
      + (o.quand === 'avance' ? ' Le rendez-vous reste confirmé ; le jour venu, ce versement compte à sa pièce.' : ' La pièce se fait au Trône, le versement y compte.')
      + plus,
    url: '/trone/#/carnet',
  };
}
/* ⟨/regler-avant-apres⟩ */

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
      (l'adresse, ou le code), l'instant.

      NOTER D'ABORD, COMPTER ENSUITE (relecture du 6 novembre 2026). On
      comptait puis on notait : des requêtes lancées ensemble passaient
      toutes avant la première note, et le frein ne tenait pas en rafale.
      Chaque essai s'inscrit donc AVANT d'être compté ; refusé, il se retire
      (marteler un frein fermé ne le prolonge pas). Un compte illisible
      FERME le frein : on ne cherche pas à l'aveugle. ── */
type Essai = number | string | null;
/** Le nombre de lignes du seau depuis `minutes`, ou null si le compte est illisible. */
async function combien(seau: string, cle: string, minutes: number): Promise<number | null> {
  const depuis = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', cle).gte('at', depuis);
  return error ? null : (count ?? 0);
}
/** Inscrit un essai et rend son identifiant, ou null si l'écriture a manqué. */
async function note(seau: string, cle: string): Promise<Essai> {
  const { data, error } = await admin.from('edge_rate_limits').insert({ bucket: seau, ip: cle }).select('id');
  return error ? null : ((data ?? [])[0]?.id ?? null);
}
/** Retire un essai qui n'a pas à compter (refusé par le frein, ou réussi). */
async function oublie(essai: Essai): Promise<void> {
  if (essai !== null) await admin.from('edge_rate_limits').delete().eq('id', essai);
}
/** Une porte ordinaire : `plafond` passages par adresse en dix minutes, l'essai noté avant d'être compté. */
async function permis(ip: string, seau: string, plafond: number): Promise<boolean> {
  const essai = await note(seau, ip);
  const vus = await combien(seau, ip, 10);
  if (essai === null || vus === null || vus > plafond) { await oublie(essai); return false; }
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

/** Les IDENTIFIANTS des rendez-vous proches, par pages de mille (le plafond
    de Supabase) : la référence se calcule sur l'identifiant seul, le contenu
    ne se lit que pour les candidats. Chaque essai ne relit donc plus cent
    jours de rendez-vous avec leurs données. */
async function lesIdsProches(maintenantMs: number): Promise<string[]> {
  const f = fenetreDeLaRecherche(maintenantMs);
  const tous: string[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await admin.from('appointments').select('id')
      .gte('data->>date', f.du).lte('data->>date', f.au).order('id').range(de, de + 999);
    if (error) throw new Error(error.message);
    const page = ((data ?? []) as { id: string }[]).map((l) => String(l.id));
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

/** SA pièce entière (la même que `leResteDeLaPiece` choisit), ou null : le
    billet en lit le reste, et la projette en facture quand elle est soldée. */
async function laPieceDuBillet(rdvId: string): Promise<PieceDeLaFin | null> {
  const { data, error } = await admin.from('invoices').select('id,data').eq('data->>apptId', rdvId).limit(20);
  if (error) throw new Error(error.message);
  const pieces = ((data ?? []) as { id: string; data: any }[]).map((l) => ({ ...(l.data ?? {}), id: l.id })) as PieceDeLaFin[];
  return pieceDuRdvDeLaFin(pieces, rdvId);
}
/** La branche de la pièce (son nom, sa ville, sa devise, ses maîtres) et la
    raison de la Maison (le document de l'identité, celui du Trône). */
async function laMaisonDuBillet(branchId: string): Promise<{ branche: Record<string, unknown> | null; raison: unknown }> {
  const [{ data: b }, { data: identite }] = await Promise.all([
    admin.from('branches').select('data').eq('id', branchId || 'aucune').maybeSingle(),
    admin.from('documents').select('data').eq('key', 'mnd_house_identity').maybeSingle(),
  ]);
  return { branche: (b?.data as Record<string, unknown> | undefined) ?? null, raison: (identite?.data as { raison?: unknown } | undefined)?.raison };
}

async function leBillet(l: Ligne, maintenantMs: number): Promise<BilletDeLaFin & { facture?: FactureDuBillet; avance?: { ouverte: boolean; raison: string } }> {
  const rdv = rdvLu(l);
  const [fiche, piece] = await Promise.all([laFiche(rdv.clientId), laPieceDuBillet(l.id)]);
  const laPiece = piece === null ? null : { resteXof: resteDeLaPieceDeLaFin(piece) };
  const billetDeBase = billetDeLaFin({
    rdv, reference: referenceDuRendezVous(l.id), prenom: String(fiche?.name ?? l.data?.clientName ?? ''),
    maintenantMs, passeAuComptoir: fiche?.passeAuComptoir === true, piece: laPiece,
  });
  /* RÉGLER DÈS MAINTENANT (7 novembre 2026, la page du rendez-vous) : avant
     l'heure du rituel, le billet dit si la porte d'avance est ouverte et, sinon,
     pourquoi (la page n'en garde qu'une phrase calme). C'est la règle de
     Ma Couronne (⟨regler-avant-apres⟩) ; le montant reste celui du billet, relu
     ici, jamais décidé par la page. */
  const billet = momentDuReglement(rdv, maintenantMs) === 'avance'
    ? {
      ...billetDeBase,
      avance: (({ ouverte, raison }) => ({ ouverte, raison }))(
        porteAvantApres({ quand: 'avance', rdv, maintenantMs, passeAuComptoir: fiche?.passeAuComptoir === true, piece: laPiece }),
      ),
    }
    : billetDeBase;
  /* LA FACTURE, seulement pièce soldée, argent reçu, rituel commencé : la
     tête soignée et la payeuse sont lues pour elle, rien de plus. */
  if (!piece || !factureAJoindreAuBillet({ rdv, piece, maintenantMs })) return billet;
  const brute = piece as unknown as Record<string, unknown>;
  const qui = fichesDeLaFactureDuBillet(brute);
  const [tete, payeuse, maison] = await Promise.all([
    qui.tete === String(rdv.clientId ?? '') ? Promise.resolve(fiche) : laFiche(qui.tete),
    qui.payeuse ? laFiche(qui.payeuse) : Promise.resolve(null),
    laMaisonDuBillet(String(brute.branchId ?? l.branch_id ?? '')),
  ]);
  const facture = factureDuBillet({
    piece: brute, tete: tete as Record<string, unknown> | null, payeuse: payeuse as Record<string, unknown> | null,
    branche: maison.branche, raison: maison.raison,
  });
  return facture ? { ...billet, facture } : billet;
}

/* ══ retrouver : le code ET les quatre chiffres ══════════════════════════ */
async function retrouver(req: Request, b: any) {
  const ip = ipOf(req);
  const code = codeLu(b.code);
  /* L'ESSAI S'INSCRIT AVANT D'ÊTRE COMPTÉ, pour l'adresse et pour le code :
     une rafale ne passe pas le frein. L'essai du code compte comme un échec
     tant qu'il n'a pas réussi ; réussi, il se retire. */
  const essaiDeLAdresse = await note('fin-retrouver', ip);
  const essaiDuCode = code ? await note('fin-echec', code) : null;
  const deLAdresse = await combien('fin-retrouver', ip, FREIN_DE_LA_RECHERCHE.minutesDeLAdresse);
  const dansLHeure = code ? await combien('fin-echec', code, 60) : 1;
  const duJour = code ? await combien('fin-echec', code, 24 * 60) : 1;
  /* Une écriture ou un compte illisible FERME le frein. Les comptes portent
     déjà cet essai : la règle juge ceux d'avant lui (d'où le « moins un »). */
  if (essaiDeLAdresse === null || (code !== null && essaiDuCode === null) || deLAdresse === null || dansLHeure === null || duJour === null
    || freinDeLaRecherche({ essaisDeLAdresse: deLAdresse - 1, echecsDuCodeDansLHeure: dansLHeure - 1, echecsDuCodeDuJour: duJour - 1 }) !== 'libre') {
    await oublie(essaiDeLAdresse);
    await oublie(essaiDuCode);
    return json({ ok: false, error: 'trop' }, 429);
  }

  const maintenant = Date.now();
  /* D'abord les seuls identifiants, puis le contenu des candidats (cinq au
     plus : un code à quatre signes ne désigne presque jamais deux rendez-vous). */
  const ids = code ? (await lesIdsProches(maintenant)).filter((id) => referenceDuRendezVous(id) === code).slice(0, 5) : [];
  /* Le même travail, trouvé ou non : un rendez-vous et une fiche sont toujours lus. */
  const candidats: Ligne[] = [];
  for (const id of ids.length ? ids : ['personne']) { const l = await leRdv(id); if (l) candidats.push(l); }
  const fiches = new Map<string, Fiche | null>();
  for (const id of candidats.length ? [...new Set(candidats.map((l) => String(l.data?.clientId ?? '')))] : ['']) fiches.set(id, await laFiche(id));
  const trouve = retrouveLeRdv({
    code: b.code, chiffres: b.chiffres, rdvs: candidats.map(rdvLu), referenceDe: referenceDuRendezVous,
    numerosDe: (r) => numerosDuRdv(r, fiches.get(String(r.clientId ?? '')) ?? null), maintenantMs: maintenant,
  });
  const ligne = trouve ? candidats.find((l) => l.id === trouve.id) ?? null : null;
  /* L'échec reste inscrit (il l'était avant la lecture) ; la réponse est la même, code inconnu ou chiffres faux. */
  if (!ligne || !SECRET_DES_LIENS) return json({ ok: false, error: 'introuvable' });
  await oublie(essaiDuCode);
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

/** Les têtes d'un même numéro qu'un seul message WhatsApp peut déclarer (le lien du foyer en porte six). */
const TETES_AU_PLUS_PAR_WHATSAPP = 6;
/** La raison d'une porte fermée ; `a-peine-commence` ne vaut que sur WhatsApp
    (les vingt premières minutes du rituel : une phrase libre n'y est pas une
    déclaration, la Maison ne pose aucune marque et Opale répond). */
type RaisonDuRefus = RaisonDeLaPorte | 'a-peine-commence';
/** Ce qui se dit quand aucune porte ne s'ouvre, dans l'ordre où la Maison le dirait. */
const ORDRE_DES_REFUS: RaisonDuRefus[] = ['a-peine-commence', 'deja-regle', 'rien-a-regler', 'avant-l-heure', 'comptoir', 'clos'];

async function terminer(req: Request, b: any) {
  const porte: PorteDeLaFin | null = b.porte === 'couronne' || b.porte === 'site' || b.porte === 'whatsapp' ? b.porte : null;
  if (!porte) return json({ ok: false, error: 'porte' }, 400);
  let ids: string[] = [];
  if (porte === 'whatsapp') {
    if (!parLeService(req)) return json({ ok: false, error: 'interdit' }, 403);
    ids = [...new Set<string>((Array.isArray(b.rdvIds) ? b.rdvIds : []).map(String).filter(Boolean))];
    /* PLUS DE SIX TÊTES LE MÊME JOUR À CE NUMÉRO : on ne coupe plus la liste
       en silence (les suivantes restaient sans marque ni lien). Rien ne se
       pose, et la conversation suit son cours avec Opale et l'équipe. */
    if (ids.length > TETES_AU_PLUS_PAR_WHATSAPP) return json({ ok: true, etat: 'trop-de-tetes' });
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
  const tetes: { ligne: Ligne; rdv: RdvDeLaFin; fiche: Fiche | null; reste: number | null; porte: { ouverte: boolean; raison: RaisonDuRefus } }[] = [];
  for (const id of [...new Set(ids)]) {
    const ligne = await leRdv(id);
    if (!ligne) continue;
    const rdv = rdvLu(ligne);
    const [fiche, reste] = await Promise.all([laFiche(rdv.clientId), leResteDeLaPiece(id)]);
    const laPorte = porteDeLaFin({ rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } });
    tetes.push({
      ligne, rdv, fiche, reste,
      /* Sur WhatsApp, le rituel qui commence à peine ne se déclare pas terminé. */
      porte: porte === 'whatsapp' && laPorte.ouverte && aPeineCommence(rdv, maintenant) ? { ouverte: false, raison: 'a-peine-commence' } : laPorte,
    });
  }
  /* Dans l'ordre de l'heure, comme la page du foyer : la notification et le total suivent cet ordre. */
  tetes.sort((a, b) => `${a.rdv.date ?? ''} ${a.rdv.time ?? ''} ${a.ligne.id}`.localeCompare(`${b.rdv.date ?? ''} ${b.rdv.time ?? ''} ${b.ligne.id}`));
  /* UN ACOMPTE DEMANDÉ, PAS ENCORE VÉRIFIÉ, ferme la porte en « comptoir » :
     le personnel l'apprend, une fois par rendez-vous et par demi-journée
     (mieux vaut deux fois que jamais : un compte illisible prévient). */
  for (const t of tetes) {
    if (t.porte.raison !== 'comptoir' || t.fiche?.passeAuComptoir === true || acompteAVerifier(t.rdv) <= 0) continue;
    const deja = await combien('fin-acompte', t.ligne.id, 12 * 60);
    if (deja !== null && deja > 0) continue;
    await note('fin-acompte', t.ligne.id);
    await previensLePersonnel(notificationDeLAcompteAVerifier({
      prenom: String(t.fiche?.name ?? t.ligne.data?.clientName ?? '').trim().split(/\s+/)[0] ?? '', heure: String(t.rdv.time ?? ''), acompteXof: acompteAVerifier(t.rdv),
    }));
  }
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
    /* REJUGÉ À CHAQUE ESSAI : quand deux déclarations se croisent, la
       première écriture de celle-ci échoue (la ligne a bougé), et la ligne
       relue porte déjà la marque de l'autre. C'est l'autre qui prévient le
       personnel : celle-ci ne le prévient pas une seconde fois. */
    let cetteEcriturePoseLaMarque = false;
    const ecrit = await ecrisLeRdv(t.ligne.id, (d) => {
      cetteEcriturePoseLaMarque = !d.termineParElle?.le;
      const marque = d.termineParElle?.le ? d.termineParElle : { le, par: porte };
      const avecLien = lien.genre === 'seul'
        ? { lienDeReglement: estUnJetonDeLaFin(d.lienDeReglement?.jeton) ? d.lienDeReglement : { ...(d.lienDeReglement ?? {}), jeton: lien.jeton, creeLe: le } }
        : { lienDuFoyer: d.lienDuFoyer?.jeton === lien.jeton ? d.lienDuFoyer : { jeton: lien.jeton, apptIds: lien.apptIds, creeLe: le } };
      if (d.termineParElle?.le && JSON.stringify({ ...d, ...avecLien }) === JSON.stringify(d)) return null;
      return { ...d, termineParElle: marque, ...avecLien };
    });
    if (ecrit === null) return json({ ok: false, error: 'ecriture' }, 409);
    if (cetteEcriturePoseLaMarque) neuve = true;
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

/* ══ avance, apres : RÉGLER AVANT ET APRÈS, depuis Ma Couronne ═══════════
   7 novembre 2026. « Pourquoi je ne peux pas faire un paiement d'un RDV sur
   ma couronne à n'importe quel moment ? » (Yéman). Par son compte
   seulement : SON rendez-vous, ou celui d'une tête qu'elle porte (le compte
   de Ma Couronne les lit déjà, la règle `est_ma_tete`). La règle juge la
   porte (⟨regler-avant-apres⟩) ; le montant est le reste du serveur ; le
   lien est celui du règlement qui existe (la page « Régler »,
   regler-la-seance), posé une fois et gardé. Rien d'autre ne s'écrit : ni
   marque, ni statut ; l'équipe l'apprend au règlement. */

/** Une tête qu'elle porte : un mineur de la famille dont elle est la payeuse, jamais archivé. */
async function estUneTeteDuCompte(parents: string[], clientId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(clientId)) return false;
  const { data: tete } = await admin.from('clients').select('data').eq('id', clientId).maybeSingle();
  const famille = String(tete?.data?.familyId ?? '');
  if (!famille) return false;
  const { data: fam } = await admin.from('families').select('data').eq('id', famille).maybeSingle();
  return teteDuCompte({ parents, tete: tete?.data ?? null, payeur: fam?.data?.payerClientId, aujourdhui: jourDeLaFin(Date.now()) });
}

async function reglerDeMaCouronne(req: Request, b: any, quand: 'avance' | 'apres') {
  if (!(await permis(ipOf(req), 'fin-regler', 20))) return json({ ok: false, error: 'trop' }, 429);
  const uid = await compteDeLaRequete(req);
  const ficheId = uid ? await ficheDuCompte(uid) : null;
  if (!uid || !ficheId) return json({ ok: false, error: 'compte' }, 401);
  const ligne = await leRdv(String(b.rdvId ?? ''));
  const clientId = String(ligne?.data?.clientId ?? '');
  /* Le rendez-vous d'une autre se dit introuvable, comme celui qui n'existe pas. */
  if (!ligne || !clientId || (clientId !== ficheId && !(await estUneTeteDuCompte([ficheId, uid], clientId)))) {
    return json({ ok: false, error: 'introuvable' }, 404);
  }
  const maintenant = Date.now();
  const rdv = rdvLu(ligne);
  const [fiche, reste] = await Promise.all([laFiche(clientId), leResteDeLaPiece(ligne.id)]);
  const laPorte = porteAvantApres({ quand, rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } });
  if (!laPorte.ouverte) return json({ ok: true, etat: laPorte.raison, quand });
  return await poseLeLienAvantApres({ ligne, rdv, quand, laPorte, maintenant });
}

/** LE LIEN D'AVANT ET D'APRÈS, posé ou relu : la fin commune de Ma Couronne
    (`reglerDeMaCouronne`) et de la page du rendez-vous (`reglerDepuisLeSite`,
    7 novembre 2026). La porte est déjà ouverte, le montant déjà relu ; ici,
    seulement le lien. `par: 'site'` signe la marque de la page du rendez-vous. */
async function poseLeLienAvantApres(o: {
  ligne: Ligne; rdv: RdvDeLaFin; quand: 'avance' | 'apres'; laPorte: PorteAvantApres; maintenant: number; par?: 'site';
}) {
  const { ligne, rdv, quand, laPorte, maintenant, par } = o;
  /* Le lien : celui que le rendez-vous porte déjà (un second toucher, le Trône), sinon un neuf. */
  const lien = lienDeLaFin({ rdvs: [rdv], aleas: crypto.getRandomValues(new Uint32Array(LONGUEUR_DU_JETON_DE_LA_FIN)) });
  if (!lien) return json({ ok: false, error: 'lien' }, 500);
  const le = new Date(maintenant).toISOString();
  /* LA MARQUE `depuisLaCouronne` : la page « Régler » ne règle un rendez-vous
     sans pièce que si Ma Couronne l'a ouvert (ouvertDepuisLaCouronne). Le
     jeton d'avant se garde ; la marque se pose une fois. La page du rendez-vous
     pose la même marque (la page « Régler » n'en lit que `le`), signée `par`. */
  const ecrit = await ecrisLeRdv(ligne.id, (d) => {
    const garde = estUnJetonDeLaFin(d.lienDeReglement?.jeton);
    if (garde && d.lienDeReglement?.depuisLaCouronne?.le) return null;
    return { ...d, lienDeReglement: { ...(d.lienDeReglement ?? {}), ...(garde ? {} : { jeton: lien.jeton, creeLe: le }), depuisLaCouronne: { quand, le, ...(par ? { par } : {}) } } };
  });
  if (ecrit === null) return json({ ok: false, error: 'ecriture' }, 409);
  const jeton = String(ecrit.lienDeReglement?.jeton ?? '');
  if (!estUnJetonDeLaFin(jeton)) return json({ ok: false, error: 'lien' }, 500);
  return json({ ok: true, etat: 'a-regler', quand, jeton, adresse: adresseDuReglementDeLaFin(jeton), resteXof: laPorte.resteXof, surLaPiece: laPorte.surLaPiece });
}

/* ══ regler : RÉGLER DÈS MAINTENANT, depuis la page du rendez-vous ═══════
   7 novembre 2026. « Permettre à la cliente de RÉGLER son RDV directement sur
   le site » (Yéman), avant le jour du rituel : le bouton « Régler dès
   maintenant » de /rdv/?v=. Par le jeton signé, comme `billet` et `terminer`
   (le site n'a pas de compte). La règle est celle de Ma Couronne,
   ⟨regler-avant-apres⟩, moment « avance » : prix figé, pas de formule, pas
   « Passe au comptoir », pas d'acompte à vérifier, « confirmé », pas déjà
   soldé. Toujours le RESTE ENTIER, jamais un montant partiel ; il vient d'ici,
   la page n'envoie aucun montant. Ouverte : le lien se pose comme pour Ma
   Couronne et l'adresse de la page « Régler » revient. Aucun argent ne se
   déplace ici : c'est la page « Régler » (regler-la-seance) qui encaisse. */
async function reglerDepuisLeSite(req: Request, b: any) {
  /* Même frein que `terminer` (vingt par adresse en dix minutes), et un par jeton. */
  if (!(await permis(ipOf(req), 'fin-regler-site', 20))) return json({ ok: false, error: 'trop' }, 429);
  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, b.v);
  if (!apptId) return json({ ok: false, error: 'lien' });
  if (!(await permis(apptId, 'fin-regler-jeton', 12))) return json({ ok: false, error: 'trop' }, 429);
  const ligne = await leRdv(apptId);
  if (!ligne) return json({ ok: false, error: 'lien' });
  const maintenant = Date.now();
  const rdv = rdvLu(ligne);
  const [fiche, reste] = await Promise.all([laFiche(rdv.clientId), leResteDeLaPiece(ligne.id)]);
  const laPorte = porteAvantApres({ quand: 'avance', rdv, maintenantMs: maintenant, passeAuComptoir: fiche?.passeAuComptoir === true, piece: reste === null ? null : { resteXof: reste } });
  if (!laPorte.ouverte) return json({ ok: true, etat: laPorte.raison, quand: 'avance' });
  return await poseLeLienAvantApres({ ligne, rdv, quand: 'avance', laPorte, maintenant, par: 'site' });
}

/* ══ dus : CE QUE LA BASE DIT QU'ELLE PEUT RÉGLER (7 novembre 2026, hotfix) ═
   Une vraie cliente a vu « À régler 34 000 F » sur un rendez-vous annulé et
   « 40 000 F » sur un passé couvert par sa formule : Ma Couronne jugeait sur
   la COPIE de ses rendez-vous gardée dans le téléphone, périmée. L'écran ne
   juge plus seul : il demande ici, et ne montre que ce que la base confirme,
   par la même règle (⟨regler-avant-apres⟩) et au montant du serveur. Lecture
   seule ; rien d'autre que les identifiants et les restes. */
async function mesDus(req: Request) {
  if (!(await permis(ipOf(req), 'fin-dus', 60))) return json({ ok: false, error: 'trop' }, 429);
  const uid = await compteDeLaRequete(req);
  const ficheId = uid ? await ficheDuCompte(uid) : null;
  if (!uid || !ficheId) return json({ ok: false, error: 'compte' }, 401);
  const parents = [ficheId, uid];
  /* Elle et les têtes qu'elle porte (les mineurs de la famille dont elle est la payeuse). */
  const { data: familles } = await admin.from('families').select('id,data').in('data->>payerClientId', parents).limit(20);
  const payeurs = new Map(((familles ?? []) as { id: string; data: any }[]).map((f) => [String(f.id), f.data?.payerClientId]));
  const idsFamilles = [...payeurs.keys()];
  const { data: membres } = idsFamilles.length
    ? await admin.from('clients').select('id,data').in('data->>familyId', idsFamilles).limit(200)
    : { data: [] as { id: string; data: any }[] };
  const fiches = new Map<string, Fiche | null>();
  const ids = [ficheId];
  for (const m of (membres ?? []) as { id: string; data: any }[]) {
    if (String(m.id) !== ficheId && teteDuCompte({ parents, tete: m.data ?? null, payeur: payeurs.get(String(m.data?.familyId ?? '')), aujourdhui: jourDeLaFin(Date.now()) })) {
      ids.push(String(m.id)); fiches.set(String(m.id), m.data ?? null);
    }
  }
  fiches.set(ficheId, await laFiche(ficheId));
  const { data: lignes, error } = await admin.from('appointments').select('id,branch_id,data').in('data->>clientId', ids).limit(1000);
  if (error) throw new Error(error.message);
  const rdvs = ((lignes ?? []) as Ligne[]).filter((l) => l.data?.status !== 'annulé');
  const pieces: PieceDeLaFin[] = [];
  for (let i = 0; i < rdvs.length; i += 60) {
    const { data: lot, error: e2 } = await admin.from('invoices').select('id,data').in('data->>apptId', rdvs.slice(i, i + 60).map((l) => l.id)).limit(1000);
    if (e2) throw new Error(e2.message);
    pieces.push(...((lot ?? []) as { id: string; data: any }[]).map((l) => ({ ...(l.data ?? {}), id: l.id }) as PieceDeLaFin));
  }
  const maintenant = Date.now();
  const apres: { rdvId: string; resteXof: number; surLaPiece: boolean }[] = [];
  const avance: { rdvId: string; resteXof: number; surLaPiece: boolean }[] = [];
  for (const l of rdvs) {
    const rdv = rdvLu(l);
    const piece = pieceDuRdvDeLaFin(pieces, l.id);
    const comptoir = fiches.get(String(rdv.clientId ?? ''))?.passeAuComptoir === true;
    for (const quand of ['avance', 'apres'] as const) {
      const p = porteAvantApres({ quand, rdv, maintenantMs: maintenant, passeAuComptoir: comptoir, piece: piece ? { resteXof: resteDeLaPieceDeLaFin(piece) } : null });
      if (p.ouverte && p.resteXof !== null && p.resteXof > 0) (quand === 'apres' ? apres : avance).push({ rdvId: l.id, resteXof: p.resteXof, surLaPiece: p.surLaPiece });
    }
  }
  return json({ ok: true, apres, avance });
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
    if (b.action === 'dus') return await mesDus(req);
    if (b.action === 'avance' || b.action === 'apres') return await reglerDeMaCouronne(req, b, b.action);
    if (b.action === 'regler') return await reglerDepuisLeSite(req, b);
    return json({ ok: false, error: 'action' }, 400);
  } catch (e) {
    console.error('terminer-et-regler:', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ ok: false, error: 'panne' }, 500);
  }
});
