/* ══ RÉGLER PAR MTN, LE COMPTE DE COLLECTE · 11 novembre 2026 ═══════════
   Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), « construis »
   de Yéman le 11 novembre 2026 au soir, sur les quatre propositions :
   · un QR fixe au comptoir, qui ouvre la page où la cliente tape son numéro
     MTN et retrouve SON rendez-vous du jour ; et « Payer par MTN » sur le
     lien personnel de chaque rendez-vous (regler.html) ;
   · la Maison garde les 1,2 % de MTN : la cliente paie le juste reste,
     aucun frais ajouté ; les frais vont en frais de la Maison ;
   · MTN d'abord pour un numéro MTN ; KkiaPay pour Moov, Celtiis et la carte ;
   · un merci libre pour l'équipe sur la même demande, partagé selon les parts.

   Le serveur, c'est la fonction `collecte-mtn` : elle seule parle à MTN
   (Collection), PAR LE RELAIS de la Maison, comme `paie-mtn`. Le compte de
   collecte n'est PAS le compte de paie : ses clés sont les siennes
   (MOMO_PROD_COLLECTION_*), et son numéro ne s'écrit jamais dans ce dépôt,
   qui est public : il se lit au serveur (MOMO_PROD_COLLECTION_NUMERO).

   Ce fichier est PUR. La fonction en porte une copie, caractère pour
   caractère, entre ses repères (scripts/collecte-copie-serveur.mjs la
   réécrit, le banc verifie-collecte-mtn la compare). */

/* ⟨collecte-mtn⟩ */
/** Un numéro mobile du Bénin, tel que MTN l'attend : 229, puis 01, puis huit chiffres. */
const RE_MSISDN_DU_BENIN = /^22901\d{8}$/;

/** LES PRÉFIXES DE MTN BÉNIN (les deux chiffres après « 01 », numérotation à
    dix chiffres du 30 novembre 2024 ; liste de l'ARCEP Bénin, à revoir si
    MTN reçoit de nouvelles tranches). Ils ne servent qu'à proposer MTN
    d'abord : MTN refuse lui-même un numéro qui n'est pas chez lui, et la
    page offre alors KkiaPay. */
const PREFIXES_MTN_DU_BENIN: readonly string[] = ['42', '46', '50', '51', '52', '53', '54', '56', '57', '59', '61', '62', '66', '67', '69', '90', '91', '96', '97'];

/** Le numéro tapé, en 22901XXXXXXXX, ou null. Un numéro à huit chiffres
    (l'ancien format) ne se complète pas : une demande au mauvais numéro
    sonnerait chez quelqu'un d'autre. */
function msisdnDe(saisi: unknown): string | null {
  let c = String(saisi ?? '').replace(/\D/g, '');
  if (c.startsWith('00229')) c = c.slice(2);
  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;
  return RE_MSISDN_DU_BENIN.test(c) ? c : null;
}

/** Un numéro de chez MTN Bénin (d'après ses préfixes). */
const estUnNumeroMtn = (msisdn: unknown): boolean => {
  const m = msisdnDe(msisdn);
  return !!m && PREFIXES_MTN_DU_BENIN.includes(m.slice(5, 7));
};

/** Le numéro dit par paires : « 01 », puis quatre paires. */
const numeroDitMtn = (msisdn: unknown): string => {
  const m = msisdnDe(msisdn);
  return m ? m.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ') : '';
};

/** « 01 97 •• •• 56 » : ce que le Trône montre d'un numéro de cliente. */
const numeroMasque = (msisdn: unknown): string => {
  const d = numeroDitMtn(msisdn);
  return d ? `${d.slice(0, 5)} •• •• ${d.slice(-2)}` : '';
};

/** Ce que MTN rend d'un titulaire (basicuserinfo) ou d'un compte (balance). */
type FicheDeMtn = { given_name?: unknown; family_name?: unknown; name?: unknown; availableBalance?: unknown } | null | undefined;

/** Le nom que MTN rend pour un numéro (basicuserinfo). */
const nomDeMtnCollecte = (c: FicheDeMtn): string | null => {
  const n = [c?.given_name, c?.family_name].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' ').trim();
  return n || (typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : null);
};

/** Le solde que MTN rend (account/balance), en francs entiers, ou null. */
const soldeDeMtnCollecte = (c: FicheDeMtn): number | null => {
  if (c?.availableBalance === undefined || c?.availableBalance === null || c?.availableBalance === '') return null;
  const n = Number(c.availableBalance);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

/** CE QUE LE SERVEUR DIT DU COMPTE, en clair, pour le bandeau de la
    direction : rien quand tout va, sinon une phrase. Jamais un code nu. */
function souciDuCompte(o: { pret: boolean; jetonHttp?: number; soldeHttp?: number }): string | null {
  if (!o.pret) return 'Les clés de collecte MTN ou le relais ne sont pas encore posés dans Supabase.';
  const j = Number(o.jetonHttp ?? 0);
  if (j === 0) return 'Le relais MTN ne répond pas : le serveur de la Maison est-il allumé ?';
  if (j === 403) return 'Le relais refuse l’appel : la clé du relais posée dans Supabase n’est pas la bonne.';
  if (j === 401) return 'MTN refuse les clés de collecte (utilisateur, clé ou abonnement) : à revoir dans Supabase.';
  if (j !== 200) return `MTN n’a pas donné de jeton (réponse ${j}).`;
  const s = Number(o.soldeHttp ?? 0);
  if (s === 200) return null;
  if (s === 0) return 'Le solde n’a pas pu être lu : le relais n’a pas répondu.';
  if (s === 401 || s === 403) return 'MTN refuse la lecture du solde : l’adresse du relais est-elle autorisée pour la collecte ?';
  return `MTN n’a pas rendu le solde (réponse ${s}).`;
}

/** « il y a 12 s », « il y a 3 min », « à l’instant ». */
function ilYaDit(depuisMs: number): string {
  const s = Math.max(0, Math.round(depuisMs / 1000));
  if (s < 2) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h`;
}
/* ⟨/collecte-mtn⟩ */

export type { FicheDeMtn };
export {
  RE_MSISDN_DU_BENIN, PREFIXES_MTN_DU_BENIN, msisdnDe, estUnNumeroMtn, numeroDitMtn, numeroMasque,
  nomDeMtnCollecte, soldeDeMtnCollecte, souciDuCompte, ilYaDit,
};
