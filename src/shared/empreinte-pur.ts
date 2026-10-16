/* ══ ENTRER PAR L'EMPREINTE — 16 octobre 2026 ═══════════════════════
   « Sur la version téléphone du Trône, pouvoir se connecter avec la
   biométrie, comme Ecobank » (Yéman, captures Ecobank et BIIC). Maquette
   16whsWP5… validée, choix cochés : toute l'équipe ; l'empreinte redemandée
   à chaque ouverture et après 5 minutes hors du Trône ; le téléphone se
   souvient du compte (prénom, e-mail masqué) ; pas de code en plus ; chacun
   retire ses clés, la direction celles de l'équipe ; l'ordinateur aussi
   (Windows Hello).

   Sous le capot : une CLÉ D'ACCÈS (passkey). Le téléphone garde une clé que
   seule l'empreinte (ou le visage, ou le code du téléphone) déverrouille ;
   le serveur de connexion de la Maison la vérifie. L'empreinte ne quitte
   jamais le téléphone.

   CE FICHIER EST PUR : le Trône et le banc lisent les mêmes règles. */

/** Après cinq minutes hors du Trône, l'écran se reverrouille (comme la banque). */
export const DELAI_DU_VERROU_MS = 5 * 60_000;
/** Qui vient d'entrer (mot de passe, empreinte) n'est pas reverrouillé dans la foulée. */
export const ENTREE_FRAICHE_MS = 60_000;

/** À l'ouverture du Trône : verrouillé si l'empreinte est activée sur cet
    appareil, sauf si l'on vient tout juste d'entrer. */
export function verrouilleALOuverture(o: { activee: boolean; entreeLe: number | null; maintenant: number }): boolean {
  if (!o.activee) return false;
  return !(o.entreeLe !== null && o.maintenant - o.entreeLe >= 0 && o.maintenant - o.entreeLe < ENTREE_FRAICHE_MS);
}
/** Au retour sur le Trône (l'onglet ou l'application revient au premier plan). */
export function verrouilleAuRetour(o: { activee: boolean; cacheDepuis: number | null; maintenant: number }): boolean {
  return o.activee && o.cacheDepuis !== null && o.maintenant - o.cacheDepuis >= DELAI_DU_VERROU_MS;
}
/** Le Trône propose l'empreinte une fois par appareil et par compte, là où l'appareil sait la lire. */
export const doitProposer = (o: { capable: boolean; activee: boolean; dejaProposee: boolean; enLigne: boolean }): boolean =>
  o.capable && o.enLigne && !o.activee && !o.dejaProposee;

/* ── LE COMPTE DONT L'APPAREIL SE SOUVIENT (comme BIIC) ── */
/** « yemanboya1@gmail.com » → « y•••••@gmail.com » : de quoi se reconnaître, pas de quoi lire l'adresse. */
export function masqueLEmail(email: string): string {
  const e = String(email ?? '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return e ? `${e[0]}•••••` : '';
  return `${e[0]}•••••${e.slice(at)}`;
}
/** Le prénom du compte : le premier mot du nom, sinon le début de l'e-mail. */
export function prenomDuCompte(nom: string | null | undefined, email: string): string {
  const n = String(nom ?? '').trim().split(/\s+/)[0];
  if (n) return n;
  const l = String(email ?? '').split('@')[0].replace(/[._\-\d]+/g, ' ').trim().split(/\s+/)[0] ?? '';
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}
export type CompteMemorise = { uid: string; prenom: string; email: string };
/** Ce que l'appareil garde du compte : jamais le mot de passe, jamais un jeton. */
export function compteAGarder(uid: string, prenom: string, email: string): CompteMemorise | null {
  return uid && email.includes('@') ? { uid, prenom: prenom.trim(), email: email.trim().toLowerCase() } : null;
}
export function lisLeCompte(brut: unknown): CompteMemorise | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  return typeof o.uid === 'string' && typeof o.email === 'string' && o.email.includes('@')
    ? { uid: o.uid, prenom: typeof o.prenom === 'string' ? o.prenom : '', email: o.email }
    : null;
}

/* ── LE NOM D'UNE CLÉ : l'appareil qui la porte ── */
export function nomDeLAppareil(ua: string, modele = ''): string {
  const u = String(ua ?? '');
  const m = String(modele ?? '').trim();
  const appareil = /iPhone/.test(u) ? 'iPhone'
    : /iPad/.test(u) ? 'iPad'
      : /Android/.test(u) ? (m && m !== 'K' ? `Téléphone Android (${m})` : 'Téléphone Android')
        : /Windows/.test(u) ? 'Ordinateur Windows'
          : /Macintosh|Mac OS X/.test(u) ? 'Mac'
            : 'Ordinateur';
  const navigateur = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return (navigateur ? `${appareil} · ${navigateur}` : appareil).slice(0, 120);
}

/* ── LES DATES D'UNE CLÉ : toujours l'année ── */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function dateDeLaCle(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const j = d.getDate();
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ── CE QUE L'ÉCRAN DIT QUAND ÇA NE PASSE PAS ── */
export function messageDeLEmpreinte(e: unknown): string {
  const nom = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : '';
  const brut = e instanceof Error ? e.message : typeof e === 'string' ? e : (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : '');
  const m = `${nom} ${brut} ${e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''}`;
  if (/passkey_disabled|passkeys are disabled|experimental/i.test(m)) return 'L’entrée par l’empreinte n’est pas encore allumée côté Maison. Entrez avec le mot de passe.';
  if (/not support|webauthn.*(unsupported|support)/i.test(m)) return 'Ce navigateur ne sait pas lire l’empreinte. Entrez avec le mot de passe.';
  if (/NotAllowedError|AbortError|cancel|annul|timed out|not allowed/i.test(m)) return 'Empreinte annulée ou non reconnue. Réessayez, ou entrez avec le mot de passe.';
  if (/InvalidStateError|already registered|exclude/i.test(m)) return 'Cet appareil a déjà sa clé d’accès pour ce compte.';
  if (/not found|unknown credential|credential.*(invalid|unknown|not)|no passkey|passkey.*(not|invalid)/i.test(m)) return 'Cette clé d’accès a été retirée. Entrez avec le mot de passe, puis réactivez l’empreinte.';
  if (/network|fetch|Failed to fetch|Load failed|offline|hors ligne/i.test(m)) return 'Pas de réseau : la Maison ne peut pas vérifier la clé maintenant.';
  return 'L’empreinte n’a pas pu être vérifiée. Entrez avec le mot de passe.';
}
/** LA MAISON NE CONNAÎT PLUS CETTE CLÉ (retirée : téléphone perdu, départ) : le verrou ne
    s'ouvre surtout pas ; le Trône se déconnecte et redemande le mot de passe. */
export const estUneCleRetiree = (e: unknown): boolean => messageDeLEmpreinte(e).startsWith('Cette clé d’accès a été retirée');
/** Une panne de RÉSEAU (et non un refus) : le Trône déverrouille alors sur l'appareil seul. */
export const estUnePanneDeReseau = (e: unknown): boolean => {
  /* Un REFUS (empreinte annulée, non reconnue : « timed out or was not allowed ») n'est jamais une panne :
     sans cette garde, l'annuler redemandait aussitôt l'empreinte au téléphone seul (vu au banc). */
  const nom = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : '';
  if (/NotAllowedError|AbortError|InvalidStateError|SecurityError/.test(nom)) return false;
  const m = e instanceof Error ? `${e.name} ${e.message}` : String((e as { message?: unknown })?.message ?? e ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|AuthRetryableFetchError|ERR_|ECONN/i.test(m);
};

/* ── LES CLÉS GARDÉES SUR L'APPAREIL (localStorage) ── */
export const CLE_COMPTE = 'mnd_compte_memorise';
export const cleDeLEmpreinte = (uid: string): string => `mnd_empreinte::${uid}`;
export const cleDeLaProposition = (uid: string): string => `mnd_empreinte_proposee::${uid}`;
export const CLE_ENTREE = 'mnd_vient_d_entrer';
export type EmpreinteDeLAppareil = { passkeyId: string; nom: string; le: string };
export function lisLEmpreinte(brut: unknown): EmpreinteDeLAppareil | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  return typeof o.passkeyId === 'string' && o.passkeyId ? { passkeyId: o.passkeyId, nom: String(o.nom ?? ''), le: String(o.le ?? '') } : null;
}
