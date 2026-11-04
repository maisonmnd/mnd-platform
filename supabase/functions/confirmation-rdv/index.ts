/* ═══════════════════════════════════════════════════════════════════
   CONFIRMATION-RDV — le mot qui part dès qu'un rendez-vous est pris.

   « Je peux avoir une confirmation WhatsApp automatique pour tous les
   nouveaux RDV ? » (Yéman, 28 août 2026). Oui — et voici comment, avec ce
   qu'il faut savoir.

   ELLE BALAIE, ELLE N'ÉCOUTE PAS. Un rendez-vous peut naître de quatre
   endroits : le Calendrier du Trône, le bouton « + RDV », la modale d'appel
   reçu, et Ma Couronne. Brancher l'envoi sur CHAQUE écran, c'est quatre
   occasions de l'oublier, et zéro confirmation le jour où une cliente ferme
   son téléphone avant que la page ait fini. Le cron passe donc toutes les dix
   minutes et confirme ce qui est neuf, d'où qu'il vienne.

   L'IDEMPOTENCE EST DANS L'IDENTIFIANT. Chaque envoi s'inscrit dans `envois`
   sous `conf-<rdv>-<canal>` : le cron peut se réveiller cent fois, une
   cliente ne reçoit qu'une confirmation. C'est la même règle que `rappels-j1`,
   et c'est elle qui rend le balayage sûr.

   ON NE CONFIRME PAS LE PASSÉ. Un rendez-vous déjà tenu, ou annulé, ne reçoit
   rien : « votre rendez-vous est confirmé » sur un rituel d'hier ferait douter
   de tout le reste.

   LE WHATSAPP N'EST ENVOYÉ QUE SI LES CLÉS META SONT POSÉES (WA_TOKEN,
   WA_PHONE_ID, WA_TEMPLATE_CONF). Sans elles, la fonction envoie le push et
   passe, SANS BRUIT — exactement comme `rappels-j1`. Le jour où la
   vérification Meta aboutit, le WhatsApp part sans qu'on retouche une ligne.

   AUCUN SECRET ICI. Tout vient de l'environnement (supabase secrets set …) —
   ce fichier vit dans un dépôt public.

   Déploiement : Supabase → Edge Functions → New function « confirmation-rdv »
   → coller CE FICHIER ENTIER → Deploy. Puis le cron, toutes les 10 minutes
   (voir docs/BRANCHER-ENVOIS.md).
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon — pas celui du serveur

/** La fenêtre de rattrapage : on regarde les rendez-vous touchés dans les
    deux dernières heures. Large devant un cron de dix minutes, pour qu'une
    panne d'une heure ne fasse perdre aucune confirmation — l'identifiant
    déterministe empêche de toute façon le doublon. */
const FENETRE_MS = 2 * 60 * 60 * 1000;

type Rdv = {
  id: string;
  branchId?: string;
  clientId: string;
  clientName?: string;
  /** Le numéro du parent qui a pris le rendez-vous (fiche à deux numéros). */
  numeroAPrevenir?: string;
  date: string;
  time: string;
  status: string;
  creeLe?: string;
  source?: string;
  /** La confirmation décochée au « + RDV » du Trône (28 octobre 2026). */
  sansConfirmation?: boolean;
  /** Le foyer qui vient ensemble (2 septembre 2026) : un message pour tous (4 novembre 2026). */
  foyerId?: string;
};

/* ══ UN RENDEZ-VOUS POSÉ APRÈS SON HEURE NE SE DIT À PERSONNE — 13 sept. 2026 ══
   « Chaque fois que je pose un rendez-vous dans le passé, n'envoie aucun
   WhatsApp, aucun rappel, rien à la cliente par l'API » (Yéman).

   Un rituel saisi après coup (une venue sans rendez-vous, un carnet mis à
   jour le soir) n'est pas une réservation : le confirmer écrirait à une
   cliente déjà repartie. LE JUGE : l'instant du rendez-vous, à l'heure du
   salon, comparé à l'instant où il a été POSÉ. Cet instant vient d'abord de
   la trace signée par la base (0092, heure du serveur), à défaut de
   `creeLe` (horloge de l'appareil). Un rendez-vous déplacé ensuite vers
   l'avenir redevient une vraie réservation, et reçoit ses messages.

   Recopié à l'identique dans avis-google et dans `shared/agenda.ts` (une
   fonction Edge n'importe rien du dépôt) ; éprouvé par `verifie-envois`. */
const momentDuRdv = (a: { date: string; time?: string }): number => {
  const h = /^\d{1,2}:\d{2}$/.test(a.time ?? '') ? (a.time as string).padStart(5, '0') : '23:59';
  return new Date(`${a.date}T${h}:00+01:00`).getTime();
};

const poseApresSonHeure = (a: { date: string; time?: string; creeLe?: string }, poseLe?: string): boolean => {
  const quand = Date.parse(poseLe ?? a.creeLe ?? '');
  return Number.isFinite(quand) && momentDuRdv(a) <= quand;
};

/* ══ « C'EST CONFIRMÉ » NE SE DIT QUE D'UN RENDEZ-VOUS CONFIRMÉ — 18 sept. 2026 ══
   Arbitrage de Yéman (maquette `maquette-le-journal-des-envois.html`). Avant,
   tout rendez-vous non annulé était confirmé : la cliente du site lisait
   « c'est confirmé » sur une place encore en attente. Désormais le message
   part quand le rendez-vous PASSE à « confirmé », d'où qu'il vienne ; son
   `updated_at` bouge à ce moment-là, le balayage le voit dans les dix minutes.
   Recopié à l'identique de `shared/agenda.ts` ; éprouvé par `verifie-envois`. */
const estAConfirmer = (
  a: { status: string; clientId?: string; date: string; time?: string },
  maintenantMs: number,
): boolean => a.status === 'confirmé' && !!a.clientId && momentDuRdv(a) > maintenantMs;

/* ══ UNE CONFIRMATION NE RATTRAPE JAMAIS LE PASSÉ — 21 septembre 2026 ══
   « Pourquoi tous ces messages sont partis aujourd'hui à 18 h ? Je veux
   juste les rappels du lendemain, pas tous les rendez-vous d'ici 2027 »
   (Yéman). Ce soir-là, une écriture en bloc a touché des rendez-vous
   d'octobre ; le balayage les a crus neufs et chaque cliente a reçu « c'est
   confirmé » des semaines après avoir pris sa place.

   LA FAUTE ÉTAIT DE REGARDER LA DERNIÈRE ÉCRITURE : elle bouge à chaque
   geste, à chaque synchronisation, à chaque réparation. ON REGARDE DONC
   L'HEURE DE POSE, qui ne bouge jamais. Sans aucune heure de pose, on ne
   confirme pas. La réservation du site fait exception : elle naît « en
   attente » et la Maison la confirme plus tard, c'est tout l'objet de son
   message. Recopié à l'identique de `shared/agenda.ts`.

   WHATSAPP AUSSI — 9 octobre 2026. Une inconnue qui réserve sur WhatsApp
   (`whatsapp-automate`) n'a pas encore de fiche : comme celle du site, son
   rendez-vous attend que le Trône la rattache, parfois des heures plus tard.
   Sa confirmation est déjà dite dans la conversation, et la ligne
   `conf-<rdv>-whatsapp` posée avec le rendez-vous verrouille le modèle
   payant ; si cette parole a échoué, le modèle prend le relais au
   rattachement. */
const confirmationEstNeuve = (
  a: { source?: string; creeLe?: string },
  poseLe: string | undefined,
  maintenantMs: number,
  fenetreMs: number,
): boolean => {
  if (a.source === 'site' || a.source === 'whatsapp') return true;
  const pose = Date.parse(poseLe ?? a.creeLe ?? '');
  return Number.isFinite(pose) && maintenantMs - pose <= fenetreMs;
};

/** La version de ce fichier, rendue dans chaque réponse : dire ce qui tourne
    vraiment évite de chercher une panne dans un fichier qui n'est pas celui
    qu'on croit déployé. */
const VERSION = '2026-11-04-a · un message par foyer, qui nomme chaque tête ; un périmé retenu par Opale ne se redépose pas';

/* LE LIEN DU RENDEZ-VOUS — 3 novembre 2026. Bloc RECOPIÉ tel quel de
   `src/shared/lien-du-rdv-pur.ts` (ses choix y sont écrits) ;
   `verifie-les-douze-lunes` confronte les copies. NE RIEN RETOUCHER ENTRE
   LES REPÈRES. */
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
/** Le secret des jetons, le même dans chaque fonction (voir le bloc). */
const SECRET_DES_LIENS = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();

/* LE MESSAGE DU FOYER, 4 novembre 2026. « Un seul message par foyer, au
   numéro du foyer, qui nomme toutes les têtes » (maquette du parcours du
   foyer, arbitrage 3, validée par Yéman). Deux sœurs posées ensemble (même
   `foyerId`, même jour, même numéro) reçoivent UNE confirmation : « Bonjour
   Jade et Faith, c'est confirmé : votre rendez-vous est retenu mardi 22
   décembre 2026 à 10 h. » Bloc RECOPIÉ tel quel de
   `src/shared/message-du-foyer-pur.ts` ; `verifie-les-douze-lunes` confronte
   les copies. NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨message-du-foyer⟩ */
/** Une tête à prévenir : son rendez-vous, et le numéro où on la prévient. */
export type TeteAPrevenir = { id: string; clientId?: string; foyerId?: string; date: string; time?: string; status?: string; numero?: string | null };
/** Un foyer à prévenir : la tête qui porte le message (la plus tôt), puis toutes, dans l'ordre. */
export type FoyerAPrevenir<T extends TeteAPrevenir> = { cle: string; porteur: T; tetes: T[] };

/** Le prénom d'une fiche : le premier mot de son nom, jamais le nom de famille. */
export const prenomDeLaTete = (nom: unknown): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/** Les prénoms dits en français : « Jade », « Jade et Faith », « Jade, Faith et Maëlle ». */
export function prenomsDits(prenoms: readonly string[]): string {
  const p = prenoms.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`;
}

/** La clé du numéro : 229 et huit chiffres, que Meta et la fiche l'écrivent avec ou sans le 01. */
export const cleDuNumeroDuFoyer = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  const n = !d ? '' : d.startsWith('00229') ? d.slice(2) : d.startsWith('229') ? d : d.length === 10 && d.startsWith('01') ? `229${d}` : d.length === 8 ? `22901${d}` : d;
  return n.length === 13 && n.startsWith('22901') ? `229${n.slice(5)}` : n;
};

const heureDuFoyer = (t?: string): string => (/^\d{1,2}:\d{2}$/.test(t ?? '') ? (t as string).padStart(5, '0') : '23:59');
const plusTot = (a: TeteAPrevenir, b: TeteAPrevenir): number =>
  `${a.date} ${heureDuFoyer(a.time)} ${a.id}`.localeCompare(`${b.date} ${heureDuFoyer(b.time)} ${b.id}`);

/** Le foyer d'une tête : son `foyerId`, son jour, la clé de son numéro. Sans foyer ou sans numéro, elle est seule. */
export const cleDuFoyer = (t: TeteAPrevenir): string => {
  const numero = cleDuNumeroDuFoyer(t.numero);
  return t.foyerId && t.date && numero ? `foyer|${t.foyerId}|${t.date.slice(0, 10)}|${numero}` : `seule|${t.id}`;
};

/** LES FOYERS À PRÉVENIR : un groupe par foyer, par jour et par numéro, jamais un rendez-vous annulé ; la tête la plus tôt porte le message. */
export function foyersAPrevenir<T extends TeteAPrevenir>(tetes: readonly T[]): FoyerAPrevenir<T>[] {
  const groupes = new Map<string, T[]>();
  const vus = new Set<string>();
  for (const t of tetes) {
    if (!t || !t.id || t.status === 'annulé' || vus.has(t.id)) continue;
    vus.add(t.id);
    const cle = cleDuFoyer(t);
    groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
  }
  return [...groupes.entries()]
    .map(([cle, g]) => { const tries = [...g].sort(plusTot); return { cle, porteur: tries[0], tetes: tries }; })
    .sort((a, b) => plusTot(a.porteur, b.porteur));
}

/** Les têtes du foyer, une fois par fiche. */
const unesParFiche = <T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): T[] => {
  const vues = new Set<string>();
  return f.tetes.filter((t) => { const k = t.clientId || t.id; if (vues.has(k)) return false; vues.add(k); return true; });
};

/** L'APPEL DU MESSAGE : une fiche seule garde son appel (sa civilité) ; dès deux fiches, leurs prénoms. */
export function appelDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>, appelSeule: (t: T) => string, prenomDe: (t: T) => string): string {
  const fiches = unesParFiche(f);
  return fiches.length <= 1 ? appelSeule(f.porteur) : prenomsDits(fiches.map(prenomDe));
}

/** Ce que la ligne d'envoi porte en plus pour un foyer de deux rendez-vous ou plus ; rien pour une tête seule. */
export function champsDuFoyer<T extends TeteAPrevenir>(f: FoyerAPrevenir<T>): { foyerId?: string; apptIds?: string[]; clientIds?: string[] } {
  if (f.tetes.length < 2) return {};
  return {
    ...(f.porteur.foyerId ? { foyerId: f.porteur.foyerId } : {}),
    apptIds: f.tetes.map((t) => t.id),
    clientIds: [...new Set(f.tetes.map((t) => t.clientId).filter((c): c is string => !!c))],
  };
}

const listeDuFoyer = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter(Boolean) : []);
/** Les rendez-vous qu'une ligne nomme : le sien, et ceux de son foyer. */
export const tetesNommees = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.apptId ?? ''), ...listeDuFoyer(l?.apptIds)].filter(Boolean))];
/** Les fiches qu'une ligne ou un message du fil nomme : la sienne, et celles de son foyer. */
export const fichesNommees = (l: { clientId?: unknown; clientIds?: unknown } | null | undefined): string[] =>
  [...new Set([String(l?.clientId ?? ''), ...listeDuFoyer(l?.clientIds)].filter(Boolean))];
/** Une ligne nomme-t-elle ce rendez-vous ? Le Trône lit ainsi la tournée de chaque tête. */
export const nommeLeRendezVous = (l: { apptId?: unknown; apptIds?: unknown } | null | undefined, apptId: string): boolean =>
  !!apptId && tetesNommees(l).includes(apptId);

/** LES TÊTES COUVERTES : les rendez-vous que nomme une ligne de ce type et de ce canal qui verrouille. */
export function tetesCouvertes<L extends { type?: unknown; canal?: unknown; apptId?: unknown; apptIds?: unknown }>(
  lignes: readonly (L | null | undefined)[], o: { type: string; canal: string; verrouille: (l: L) => boolean },
): Set<string> {
  const couvertes = new Set<string>();
  for (const l of lignes) {
    if (!l || String(l.type ?? '') !== o.type || String(l.canal ?? '') !== o.canal || !o.verrouille(l)) continue;
    for (const id of tetesNommees(l)) couvertes.add(id);
  }
  return couvertes;
}

/** UN FOYER QUI NE TIENT PLUS, relu avant l'envoi : une autre tête nommée a
    disparu, est annulée ou a changé de jour. Le message ne part pas
    (« périmé », sans la marque d'Opale) : la fonction qui l'a déposé le
    refait avec les têtes qui restent. `rdvs` : les rendez-vous relus. */
export function foyerQuiNeTientPlus(
  l: { apptId?: unknown; apptIds?: unknown; dateRdv?: unknown },
  rdvs: ReadonlyMap<string, { date?: string; status?: string } | null | undefined>,
): string | null {
  const jour = String(l.dateRdv ?? '').slice(0, 10);
  for (const id of tetesNommees(l)) {
    if (id === String(l.apptId ?? '')) continue;
    const r = rdvs.get(id);
    if (!r) return 'un rendez-vous du foyer n’existe plus : le message se refait sans lui';
    if (r.status === 'annulé') return 'un rendez-vous du foyer a été annulé : le message se refait sans lui';
    if (String(r.date ?? '').slice(0, 10) !== jour) return 'un rendez-vous du foyer a changé de jour : le message se refait sans lui';
  }
  return null;
}
/* ⟨/message-du-foyer⟩ */

/* CE QU'OPALE A RETENU NE SE REDÉPOSE PAS, 4 novembre 2026. La porte
   d'Opale (envois-partent) rend « périmé » la confirmation qu'elle retient,
   avec le détail « retenu par Opale : <motif> ». La redéposer au passage
   suivant la ferait juger encore, ou partir : elle verrouille comme un
   envoi. La marque est celle de la porte, mot pour mot (comme rappels-j1). */
const retenuParOpale = (d: { detail?: unknown } | null | undefined): boolean => String(d?.detail ?? '').startsWith('retenu par Opale');

/* UNE RAFALE NE PART JAMAIS TOUTE SEULE — 21 septembre 2026. Le soir du
   21, une écriture en bloc a fait partir des dizaines de confirmations d'un
   coup. Une prise de rendez-vous, c'est une ou deux confirmations par
   passage ; au-delà, c'est un accident, et on n'envoie RIEN. Mieux vaut un
   silence que la Maison peut voir dans le journal des fonctions qu'un
   message inutile chez quarante clientes.

   ON NE COMPTE QUE CE QUI RESTE À DIRE — 10 octobre 2026 (revue de nuit). La
   fenêtre de deux heures garde les rendez-vous déjà confirmés : six poses de
   l'accueil en deux heures faisaient six candidats au passage suivant, la
   rafale jouait, et la septième cliente n'était jamais confirmée. La rafale
   se compte désormais APRÈS le journal, sur les seuls rendez-vous qui ont
   encore un message à recevoir. */
const RAFALE_MAX = 5;

/* UN ENVOI A UNE DURÉE BORNÉE, ET SE CONSIGNE AUSSITÔT — 10 octobre 2026
   (revue de nuit). Un appel à Meta ou à push-notify qui pendait jusqu'à la
   limite de la fonction la tuait au milieu de la boucle : les messages
   déjà partis n'étaient pas au journal (écrit d'un seul geste, à la fin), et
   le passage suivant les renvoyait. Chaque appel est borné à huit secondes,
   et le journal d'un rendez-vous s'écrit dès ses envois faits. */
const ENVOI_MAX_MS = 8_000;

/** L'heure de pose signée par la base, rendez-vous par rendez-vous. Une trace
    absente (rendez-vous d'avant 0092) laisse la place à `creeLe`. */
// deno-lint-ignore no-explicit-any
const posesSignees = async (sb: any, ids: string[]): Promise<Map<string, string>> => {
  const m = new Map<string, string>();
  if (ids.length === 0) return m;
  const { data, error } = await sb.from('traces').select('piece_id, fait_le')
    .eq('table_name', 'appointments').eq('operation', 'pose').in('piece_id', ids);
  if (error) return m;
  for (const r of (data ?? []) as { piece_id: string; fait_le: string }[]) {
    if (!m.has(r.piece_id)) m.set(r.piece_id, r.fait_le);
  }
  return m;
};

type Fiche = { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean };

/* ══ LA SALLE D'ATTENTE — 2 octobre 2026 ═══════════════════════════════
   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur… »
   (Yéman). Cette fonction ne s'adresse plus à la cliente : elle DÉPOSE son
   message dans le journal des envois, statut « en-attente », avec son heure
   de départ (dix minutes de salle, jamais pendant les heures calmes) et son
   colis. Le facteur `envois-partent`, réveillé chaque minute, le porte, sauf
   si une main l'a retenu depuis le Trône.

   SI LE FACTEUR SE TAIT depuis plus de cinq minutes, on envoie comme avant :
   mieux vaut un message parti sans salle qu'un message déposé que personne ne
   porterait.

   LE CALCUL EST RECOPIÉ de `src/shared/salle-des-envois.ts` ; le harnais
   `verifie-la-salle-des-envois` tient les deux ensemble. */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

/** Ce qu'une ligne déposée porte en plus de son identité : quand elle part,
    à qui (le prénom, pour l'écran de la salle) et de quoi l'envoyer. */
const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};
/** Les verdicts qui ne verrouillent pas : un raté se retente, un message
    périmé (rendez-vous déplacé pendant l'attente) peut se redéposer. */
const SE_RETENTE = new Set(['échec', 'périmé']);
/* ══ UNE PAROLE « EN COURS » NE VERROUILLE PAS POUR TOUJOURS · relecture du
   9 octobre 2026 ══ La ligne `conf-<rdv>-whatsapp` naît « en cours » avec le
   rendez-vous que WhatsApp pose (`pose_si_libre`, 0125) : la confirmation
   part dans la conversation, et la ligne passe à « envoyé » ou « échec ».
   Si le tour s'arrête entre les deux (Meta qui pend, une base qui hoquette),
   elle resterait « en cours », et la cliente sans rien. Passé dix minutes
   (un tour de l'automate en dure quelques secondes), elle se retente : le
   modèle prend le relais. Une heure illisible ne verrouille pas non plus. */
const EN_COURS_PERIME_MS = 10 * 60 * 1000;
const enCoursPerime = (d: { statut?: string; quand?: string } | null | undefined, maintenantMs: number): boolean => {
  if ((d?.statut ?? '') !== 'en cours') return false;
  const q = Date.parse(d?.quand ?? '');
  return !(Number.isFinite(q) && maintenantMs - q < EN_COURS_PERIME_MS);
};

/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/** Numéro béninois → format international sans « + » (exigé par Meta).
    Même règle que `rappels-j1` : 229… reste tel quel · 01XXXXXXXX se préfixe
    229 · XXXXXXXX (ancien plan) se préfixe 22901. Autre forme : on la laisse,
    mieux vaut un échec consigné qu'une correction muette. */
/* LE PARENT QUI A PRIS LE RENDEZ-VOUS — 27 octobre 2026 (« la personne qui a
   pris le RDV reçoit la confirmation et le rappel », Yéman). Une fiche à deux
   numéros (papa, maman) : le rendez-vous retient celui à prévenir. Copie
   conforme de `telDuRdv` (src/shared/numero-a-prevenir-pur.ts). */
const telDuRdv = (a: { numeroAPrevenir?: string }, fiche?: { phone?: string }): string =>
  (a.numeroAPrevenir ?? '').trim() || (fiche?.phone ?? '').trim();

const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/** « 8 h 30 », « 14 h » — l'heure telle qu'on la DIT, pas telle qu'on la tape.
    « 09:00 » est un horaire de train : on l'écrit pour une machine. La cliente
    lit « neuf heures » de toute façon, autant l'écrire ainsi — et c'est déjà
    la règle des rappels du Trône (`heureLisible`, shared/rappel.ts). Recopiée
    ici parce qu'une fonction Edge ne peut rien importer du dépôt.

    UNE HEURE ABSENTE N'EST PAS MINUIT : `Number('')` vaut zéro, et « 0 h »
    annoncé à une cliente est pire qu'un blanc, elle y croit. */
const heureLisible = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
};

/** « vendredi 28 août 2026 » — la date telle qu'on la dit, pas telle qu'on
    la code. L'ANNÉE SE DIT (9 octobre 2026) : toute date dite à une cliente
    la porte, un rendez-vous peut se prendre trois mois à l'avance. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    });
  } catch { return iso; }
};

Deno.serve(async (req) => {
  /* ══ LA CLÉ SERVICE, NOUVELLE FAMILLE — 7 septembre 2026 ═══════════
     Depuis la rotation des clés (fuite du 2 août), le projet vit sur les
     clés « sb_… » : la legacy service_role (eyJ…) injectée par la
     plateforme ne prouve plus rien, et cette garde répondait 401 chaque
     soir, en silence. La Maison pose le secret de fonction CLE_SERVICE
     (la clé secrète sb_secret_…) ; la même valeur vit au Vault
     (« service_role_key »), c'est elle que `appelle_fonction_edge`
     envoie. Sans CLE_SERVICE posée, l'ancien monde continue tel quel. */
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';

  /* Seul le cron (armé de la clé service) a le droit de réveiller l'envoi :
     cette fonction lit des téléphones et écrit au journal. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    /* LES LONGUEURS SEULES, JAMAIS LES VALEURS : elles suffisent à situer la
       panne (sb_secret ≈ 40-50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien
       de posé de ce côté-là). */
    return new Response(
      JSON.stringify({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }),
      { status: 401 },
    );
  }

  const sb = createClient(urlBase, service);

  const aujourdhui = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();

  /* ── La voix de la Maison ────────────────────────────────────────── */
  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_house_identity', 'mnd_auto_config', 'mnd_facteur']);
  const nomMaison: string =
    (docs?.find((d) => d.key === 'mnd_house_identity')?.data?.nom ?? '').trim() || 'Maison MND';
  const cfg = (docs?.find((d) => d.key === 'mnd_auto_config')?.data ?? {}) as { itineraire?: string; salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown };
  /* LA SALLE EST OUVERTE si le facteur a donné signe de vie dans les cinq minutes. */
  const regles = reglesDepuis(cfg);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, Date.now());

  /* ── Les rendez-vous NEUFS, à venir, non annulés ─────────────────── */
  const { data: apptRows, error: errA } = await sb.from('appointments')
    .select('id, branch_id, data, updated_at')
    .gte('updated_at', depuis)
    .limit(500);
  if (errA) {
    return new Response(JSON.stringify({ erreur: errA.message }), { status: 500 });
  }

  const maintenant = Date.now();
  const candidats: Rdv[] = (apptRows ?? [])
    .map((r) => ({ ...(r.data as Rdv), id: r.id as string, branchId: (r.branch_id as string) ?? undefined }))
    /* NI LE PASSÉ NI L'ANNULÉ NI L'HONORÉ : « votre rendez-vous est confirmé »
       sur un rituel d'hier, ou déjà tenu, ferait douter de tout le reste. Le
       passé se juge À L'HEURE, pas au jour : un rendez-vous de 10 h confirmé
       à 16 h est un rendez-vous d'hier. */
    .filter((a) => a.date >= aujourdhui && estAConfirmer(a, maintenant));

  /* POSÉ APRÈS SON HEURE : aucun message, jamais (voir `poseApresSonHeure`).
     PAS POSÉ RÉCEMMENT NON PLUS : une écriture en bloc ne réveille pas des
     rendez-vous d'octobre (voir `confirmationEstNeuve`, 21 septembre). */
  const poses = await posesSignees(sb, candidats.map((a) => a.id));
  /* LA CONFIRMATION DÉCOCHÉE — 28 octobre 2026 : au « + RDV », l'accueil
     peut dire « la Maison la prévient elle-même ». Rien ne part ; le rappel
     de la veille suit comme pour toutes. */
  const rdvs = candidats.filter((a) => !a.sansConfirmation && !poseApresSonHeure(a, poses.get(a.id))
    && confirmationEstNeuve(a, poses.get(a.id), maintenant, FENETRE_MS));

  if (rdvs.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, vus: 0, ecartes: candidats.length, push: 0, whatsapp: 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  /* ── CE QUI EST DÉJÀ PARTI — l'idempotence ───────────────────────
     On demande les identifiants exacts qu'on s'apprête à écrire : le cron
     peut se réveiller cent fois, une cliente ne reçoit qu'une confirmation. */
  const attendus = rdvs.flatMap((a) => [`conf-${a.id}-push`, `conf-${a.id}-whatsapp`]);
  /* ══ UN RATÉ SE RETENTE, UN ENVOI RÉUSSI JAMAIS — 11 septembre 2026 ══
     Le journal servait de verrou SANS REGARDER LE VERDICT : une tentative
     échouée bloquait le rappel pour toujours, exactement comme un envoi
     réussi. Vu le soir où les modèles étaient encore en revue — les trois
     clientes du lendemain seraient restées sans WhatsApp alors que
     l'approbation allait tomber dans la nuit. Une coupure réseau d'un soir
     aurait fait le même dégât, en silence.

     Seuls les verdicts DÉFINITIFS verrouillent : « envoyé » (c'est parti,
     le refaire écrirait deux fois à la même tête) et « sans-abonnement »
     (elle n'a pas l'appli, réessayer chaque heure ne la lui installera
     pas). Un « échec » laisse la porte ouverte : la confirmation ne vise qu'une
     fenêtre de deux heures, le rattrapage s'y éteint de lui-même. */
  const { data: dejaRows } = await sb.from('envois').select('id, data').in('id', attendus);
  const deja = new Set(
    (dejaRows ?? [])
      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? '') || retenuParOpale(r.data as { detail?: unknown } | null))
      .filter((r) => !enCoursPerime(r.data as { statut?: string; quand?: string } | null, Date.now()))
      .map((r) => r.id as string),
  );

  /* ══ UNE TÊTE NOMMÉE PAR LE MESSAGE DE SON FOYER EST CONFIRMÉE · 4 novembre 2026 ══
     La confirmation d'un foyer vit sous la ligne de sa première tête
     (`conf-<la plus tôt>-whatsapp`) et nomme les autres (`apptIds`). Une
     tête nommée par une ligne qui verrouille (déposée, partie, retenue par
     une main ou par Opale) ne reçoit rien de plus : sa ligne compte comme
     posée. Une lecture qui échoue tait ce passage-ci pour les têtes d'un
     foyer, le suivant les reprend (la fenêtre est de deux heures). */
  const foyersVus = [...new Set(rdvs.map((a) => a.foyerId).filter((f): f is string => !!f))];
  if (foyersVus.length > 0) {
    const { data: duFoyer, error: errFoyer } = await sb.from('envois').select('id, data').in('data->>foyerId', foyersVus).limit(500);
    const verrouille = (d: { statut?: string; quand?: string; detail?: unknown }): boolean =>
      (!SE_RETENTE.has(d.statut ?? '') || retenuParOpale(d)) && !enCoursPerime(d, Date.now());
    const couvertes = errFoyer
      ? new Set(rdvs.filter((a) => !!a.foyerId).map((a) => a.id))
      : tetesCouvertes(((duFoyer ?? []) as { data: { type?: string; canal?: string; apptId?: string; apptIds?: unknown; statut?: string; quand?: string; detail?: unknown } }[]).map((r) => r.data),
        { type: 'confirmation', canal: 'whatsapp', verrouille });
    for (const id of couvertes) deja.add(`conf-${id}-whatsapp`);
  }

  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  /* Un modèle À PART de celui du rappel : Meta approuve chaque modèle pour un
     usage, et confirmer n'est pas rappeler. */
  const WA_TEMPLATE = Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv';
  /* LA CONFIRMATION À LIENS — 3 novembre 2026 : la référence et deux
     boutons (« Déplacer ou annuler », « Ajouter à mon agenda ») dès que le
     modèle `confirmation_rdv_liens` est approuvé et son nom posé ici ; si
     Meta le refuse (#132xxx), l'ancien part, en direct comme en salle. */
  const WA_TEMPLATE_LIENS = (Deno.env.get('WA_TEMPLATE_CONF_LIENS') ?? '').trim();

  /* CE QUI RESTE À DIRE : un push pas encore verrouillé, ou un WhatsApp pas
     encore verrouillé quand les clés Meta sont posées. Un rendez-vous déjà
     confirmé sur tous ses canaux ne compte plus dans la rafale. */
  const aEnvoyer = rdvs.filter((a) => !deja.has(`conf-${a.id}-push`)
    || (!!WA_TOKEN && !!WA_PHONE_ID && !deja.has(`conf-${a.id}-whatsapp`)));
  if (aEnvoyer.length === 0) {
    return new Response(JSON.stringify({ version: VERSION, vus: rdvs.length, dejaDits: rdvs.length, push: 0, whatsapp: 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  /* LA RAFALE S'ARRÊTE ICI. Une prise de rendez-vous, c'est un ou deux
     messages par passage. Au-delà, quelque chose a écrit en bloc, et l'on
     préfère un silence visible au journal des fonctions à quarante messages
     inutiles chez les clientes. */
  if (aEnvoyer.length > RAFALE_MAX) {
    console.error(`confirmation-rdv: rafale écartée, ${aEnvoyer.length} rendez-vous d'un coup, rien n'est parti`);
    return new Response(
      JSON.stringify({ version: VERSION, rafaleEcartee: aEnvoyer.length, push: 0, whatsapp: 0 }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  /* ── Les fiches, pour le prénom et le téléphone ──────────────────── */
  const { data: ficheRows } = await sb.from('clients')
    .select('id, data')
    .in('id', [...new Set(aEnvoyer.map((a) => a.clientId))]);
  const fiches = new Map<string, Fiche>(
    (ficheRows ?? []).map((r) => [r.id as string, { id: r.id as string, ...(r.data as Fiche) }]),
  );

  /* ══ LE FOYER, UN SEUL WHATSAPP · 4 novembre 2026 ══════════════════════
     Les têtes qui attendent encore leur WhatsApp, rangées par foyer (même
     `foyerId`, même jour, même numéro à prévenir). La plus tôt porte le
     message, au nom de toutes ; les autres n'en reçoivent pas d'autre. Une
     tête seule, ou sans foyer, part comme avant, avec sa civilité. Le push,
     lui, reste à chaque tête : il va à l'appli de chacune, pas à un numéro. */
  const foyersWa = foyersAPrevenir(aEnvoyer
    .filter((a) => !!WA_TOKEN && !!WA_PHONE_ID && !deja.has(`conf-${a.id}-whatsapp`))
    .map((a) => ({ ...a, numero: numeroIntl(telDuRdv(a, fiches.get(a.clientId))) }))
    .filter((a) => !!a.numero));
  const foyerDuPorteur = new Map(foyersWa.filter((f) => f.tetes.length > 1).map((f) => [f.porteur.id, f]));
  /* Les autres têtes d'un foyer sont dites par le WhatsApp de la première :
     le leur compte comme posé, aucun ne part. */
  for (const f of foyersWa) for (const t of f.tetes.slice(1)) deja.add(`conf-${t.id}-whatsapp`);
  const prenomDuFoyer = (t: Rdv): string => prenomDeLaTete(fiches.get(t.clientId)?.name ?? t.clientName);

  const aInserer: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  /* ══ L'IDENTIFIANT META ET LE CODE SE GARDENT — 18 septembre 2026 ══════
     « Comment retrouver toutes les confirmations ? » (Yéman). Le journal
     écrivait « envoyé » dès que Meta acceptait, sans l'identifiant du
     message : l'accusé que le webhook reçoit ensuite (remis, lu, non remis)
     ne se rapprochait de rien. C'est la leçon des rappels du 11 septembre,
     appliquée ici. Le code d'erreur de Meta se garde aussi : c'est lui que
     le Trône traduit en motif lisible (`motifEnClair`, shared/envois). */
  const consigne = (canal: string, a: Rdv, statut: string, detail?: string, waMessageId?: string, codeMeta?: number, plus?: Record<string, unknown>) => {
    aInserer.push({
      id: `conf-${a.id}-${canal}`,
      branch_id: a.branchId ?? null,
      data: {
        id: `conf-${a.id}-${canal}`, branchId: a.branchId, type: 'confirmation', canal,
        apptId: a.id, clientId: a.clientId, dateRdv: a.date, heure: a.time,
        statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
        ...(waMessageId ? { waMessageId } : {}),
        ...(codeMeta ? { codeMeta } : {}),
        quand: new Date().toISOString(),
        /* Le WhatsApp d'un foyer dit chaque rendez-vous et chaque fiche qu'il nomme. */
        ...(canal === 'whatsapp' && foyerDuPorteur.has(a.id) ? champsDuFoyer(foyerDuPorteur.get(a.id)!) : {}),
        ...(plus ?? {}),
      },
    });
  };

  /* ══ LA CONFIRMATION PARAÎT DANS LE FIL — 18 septembre 2026 ═══════════
     Comme les rappels depuis le 11 : ouvrir la conversation d'une cliente
     dit tout ce qu'elle a reçu, y compris ce que le Trône a envoyé seul.
     Identifiant déduit de celui de Meta, pour que l'accusé du webhook
     retrouve sa ligne. */
  const auFil: { id: string; branch_id: string | null; data: Record<string, unknown> }[] = [];
  const consigneAuFil = (a: Rdv, numero: string, waId: string, texte: string, modele: string = WA_TEMPLATE) => {
    const id = `wa-${waId}`;
    auFil.push({
      id,
      branch_id: a.branchId ?? null,
      data: {
        id, waId, branchId: a.branchId, sens: 'sortant', numero, clientId: a.clientId,
        ...(foyerDuPorteur.has(a.id) ? { clientIds: champsDuFoyer(foyerDuPorteur.get(a.id)!).clientIds } : {}),
        texte, type: 'text', quand: new Date().toISOString(), etat: 'en-route',
        modele, parQui: 'Le Trône',
      },
    });
  };

  let nPush = 0, nWa = 0, nDeposes = 0, nJournal = 0;
  let journalRefuse = '';

  for (const a of aEnvoyer) {
    const fiche = fiches.get(a.clientId);
    /* L'appel de sa fiche, pour son push ; celui du foyer, pour le WhatsApp
       qu'elle porte (« Jade et Faith »). */
    const appelDeLaTete = appelDe(fiche, a.clientName);
    const sonFoyer = foyerDuPorteur.get(a.id);
    const prenom = sonFoyer ? appelDuFoyer(sonFoyer, () => appelDeLaTete, prenomDuFoyer) : appelDeLaTete;
    const quand = `${jourEnClair(a.date)} à ${heureLisible(a.time)}`;
    /* ELLE A RÉSERVÉ ELLE-MÊME (Ma Couronne, et depuis le 9 octobre 2026
       WhatsApp, au toucher « Je confirme ») : sa confirmation part tout de
       suite, elle l'attend. Tout ce que la Maison pose passe par la salle. */
    const enSalle = salleOuverte && a.source !== 'couronne' && a.source !== 'whatsapp';
    const texteDuFil = `Bonjour ${prenom}, c'est confirmé : votre rendez-vous est retenu ${quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`;
    const reference = referenceDuRendezVous(a.id);
    const jeton = WA_TEMPLATE_LIENS && SECRET_DES_LIENS ? await jetonDuRendezVous(SECRET_DES_LIENS, a.id).catch(() => '') : '';
    const sansLiens = composantsDeLaConfirmation({ avecLiens: false, prenom, quand, reference, jeton });

    /* ① PUSH — gratuit, et il part DÈS AUJOURD'HUI, sans aucune clé Meta. */
    if (enSalle && !deja.has(`conf-${a.id}-push`)) {
      consigne('push', a, 'en-attente', undefined, undefined, undefined, depot(Date.now(), regles, {
        genre: 'push', clientId: a.clientId, titre: `${nomMaison} · c'est confirmé`,
        corps: `${appelDeLaTete}, votre rendez-vous est retenu ${quand}. ${cfg.itineraire?.trim() ?? ''}`.trim(), url: '/couronne/',
      }, appelDeLaTete));
      nDeposes++;
    } else if (!deja.has(`conf-${a.id}-push`)) {
      try {
        const r = await fetch(`${urlBase}/functions/v1/push-notify`, {
          method: 'POST',
          signal: AbortSignal.timeout(ENVOI_MAX_MS),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
          body: JSON.stringify({
            mode: 'to-client',
            clientId: a.clientId,
            title: `${nomMaison} · c'est confirmé`,
            body: `${appelDeLaTete}, votre rendez-vous est retenu ${quand}. ${cfg.itineraire?.trim() ?? ''}`.trim(),
            url: '/couronne/',
          }),
        });
        const sent = ((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0;
        consigne('push', a, sent > 0 ? 'envoyé' : 'sans-abonnement');
        if (sent > 0) nPush++;
      } catch (e) {
        consigne('push', a, 'échec', String(e));
      }
    }

    /* ② WHATSAPP — seulement si la Maison a posé ses clés Meta. Le modèle
       approuvé attend deux variables : {{1}} le prénom, {{2}} le moment
       (« vendredi 28 août à 14:00 »). Sans les clés, on passe sans bruit. */
    const tel = numeroIntl(telDuRdv(a, fiche));
    /* SANS NUMÉRO, ON LE DIT AU JOURNAL (18 septembre) : la Maison voit qu'une
       confirmation n'a pas pu partir, et peut appeler. « sans-numero »
       verrouille comme « sans-abonnement » : réessayer ne l'inventera pas. */
    if (WA_TOKEN && WA_PHONE_ID && !tel && !deja.has(`conf-${a.id}-whatsapp`)) {
      consigne('whatsapp', a, 'sans-numero');
    }
    if (enSalle && WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`conf-${a.id}-whatsapp`)) {
      /* En salle, le colis emporte son repli : le facteur l'envoie si Meta
         refuse le modèle neuf. */
      consigne('whatsapp', a, 'en-attente', undefined, undefined, undefined, depot(Date.now(), regles, jeton ? {
        genre: 'whatsapp', numero: tel, modele: WA_TEMPLATE_LIENS, parQui: 'Le Trône',
        texteAuFil: texteDeLaConfirmation({ avecLiens: true, prenom, quand, reference }),
        composants: composantsDeLaConfirmation({ avecLiens: true, prenom, quand, reference, jeton }),
        repli: { modele: WA_TEMPLATE, composants: sansLiens, texteAuFil: texteDuFil },
      } : {
        genre: 'whatsapp', numero: tel, modele: WA_TEMPLATE, parQui: 'Le Trône', texteAuFil: texteDuFil,
        composants: sansLiens,
      }, prenom));
      nDeposes++;
    } else if (WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`conf-${a.id}-whatsapp`)) {
      try {
        /* Le modèle à liens d'abord quand il est posé ; un refus DU MODÈLE
           (#132xxx) fait partir l'ancien aussitôt, tout autre refus non. */
        let repliDuModele: number | undefined;
        for (const liens of jeton ? [true, false] : [false]) {
          const modele = liens ? WA_TEMPLATE_LIENS : WA_TEMPLATE;
          const plus = { modele, reference, ...(repliDuModele ? { repliDuModele } : {}) };
          const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
            method: 'POST',
            signal: AbortSignal.timeout(ENVOI_MAX_MS),
            headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: tel,
              type: 'template',
              template: {
                name: modele,
                language: { code: 'fr' },
                components: liens ? composantsDeLaConfirmation({ avecLiens: true, prenom, quand, reference, jeton }) : sansLiens,
              },
            }),
          });
          const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
          const waId = String(rep?.messages?.[0]?.id ?? '');
          if (r.ok && waId) {
            consigne('whatsapp', a, 'envoyé', undefined, waId, undefined, plus);
            consigneAuFil(a, tel, waId, liens ? texteDeLaConfirmation({ avecLiens: true, prenom, quand, reference }) : texteDuFil, modele);
            nWa++;
          } else if (r.ok) {
            /* Accepté sans identifiant : on ne saura pas ce qu'il devient, et le
               journal le dit plutôt que de promettre un suivi. */
            consigne('whatsapp', a, 'envoyé', 'accepté sans identifiant Meta', undefined, undefined, plus);
            nWa++;
          } else if (liens && refusDuModele(rep?.error?.code)) {
            repliDuModele = Number(rep?.error?.code);
            continue;
          } else {
            consigne('whatsapp', a, 'échec', String(rep?.error?.message ?? `HTTP ${r.status}`), undefined,
              Number(rep?.error?.code) || undefined, plus);
          }
          break;
        }
      } catch (e) {
        consigne('whatsapp', a, 'échec', String(e));
      }
    }

    /* ── LE JOURNAL DE CE RENDEZ-VOUS, AUSSITÔT (10 octobre 2026) ──────
       `upsert` plutôt qu'`insert` : deux réveils simultanés du cron ne
       doivent pas faire échouer la course, seulement écrire la même ligne.
       SI LE JOURNAL REFUSE, ON S'ARRÊTE : un message parti sans trace
       repartirait au passage suivant, et les rendez-vous d'après aussi. */
    const lignes = aInserer.splice(0);
    if (lignes.length > 0) {
      const { error: errJ } = await sb.from('envois').upsert(lignes, { onConflict: 'id' });
      if (errJ) {
        journalRefuse = errJ.message;
        console.error('confirmation-rdv: journal refusé, envoi arrêté', errJ.message);
        break;
      }
      nJournal += lignes.length;
    }
    /* Le fil, s'il y a quelque chose à y mettre. Une erreur d'écriture ne fait
       pas tomber l'envoi : la confirmation est partie, c'est l'essentiel. */
    const auFilDuRdv = auFil.splice(0);
    if (auFilDuRdv.length > 0) {
      const { error } = await sb.from('messages_wa').upsert(auFilDuRdv, { onConflict: 'id' });
      if (error) console.error('confirmation-rdv: fil', error.message);
    }
  }

  return new Response(
    JSON.stringify({ version: VERSION, vus: rdvs.length, ecartes: candidats.length - rdvs.length, salle: salleOuverte, deposes: nDeposes, push: nPush, whatsapp: nWa, journal: nJournal, ...(journalRefuse ? { journalRefuse } : {}), modele: WA_TEMPLATE, ...(WA_TEMPLATE_LIENS ? { modeleLiens: WA_TEMPLATE_LIENS } : {}) }),
    { status: journalRefuse ? 500 : 200, headers: { 'content-type': 'application/json' } },
  );
});
