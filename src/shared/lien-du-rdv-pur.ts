/* LE LIEN DU RENDEZ-VOUS — 3 novembre 2026. Sept changements demandés par
   Yéman sur la réservation de maisonmnd.com, dont trois tiennent ici :
   une RÉFÉRENCE lisible pour chaque rendez-vous (« MND-7K3Q »), dite à
   l'écran avant le message WhatsApp ; dans la confirmation WhatsApp, un
   bouton « Déplacer ou annuler » et un bouton « Ajouter à mon agenda ».

   Un modèle Meta ne porte pas de lien libre : ses boutons ont une adresse
   fixe suivie d'UNE variable. Les deux boutons du modèle
   `confirmation_rdv_liens` ouvrent donc deux pages du site, avec un JETON
   SIGNÉ qui désigne le rendez-vous sans rien dire de la cliente :
   `https://maisonmnd.com/rdv/?v=<jeton>` (déplacer, annuler, l'agenda) et
   `https://maisonmnd.com/rdv/agenda/?v=<jeton>` (le fichier .ics, que la
   page construit avec ce que la fonction lui rend : demande-submit garde son
   contrôle d'appel, un lien ouvert depuis WhatsApp ne l'a pas). Le jeton est l'identifiant du
   rendez-vous et une signature HMAC : il ne se devine pas, il ne se forge
   pas, et il ne vaut que pour ce rendez-vous.

   Ce bloc vit à l'identique dans deux fonctions Edge qui n'importent rien
   du dépôt (demande-submit, confirmation-rdv) ; assistants-maison, regroupée
   par esbuild, l'importe. Le banc des douze lunes compare les copies. Module PUR : ni Supabase, ni DOM ; `crypto.subtle`
   seulement, présent dans Deno, les navigateurs et Node. */

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
