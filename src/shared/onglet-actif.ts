/* ══ UN SEUL ONGLET DU TRÔNE TIENT LA MAIN — 20 novembre 2026 ══════════════
   Le choix de Yéman (« A ») : comme WhatsApp Web, un seul onglet du Trône
   travaille à la fois ; l'autre se met en pause et le dit, avec « Utiliser
   ici ».

   POURQUOI. Deux onglets du même navigateur partagent le même stockage, et se
   répondaient mal. Le 18 novembre, un rendez-vous annulé dans un onglet est
   revenu « confirmé » trois minutes plus tard, écrit par l'autre : chaque
   onglet prenait ce que l'autre posait dans le stockage pour un geste à lui
   (daté de maintenant, donc gagnant), et chacun réécrivait toute la file
   d'attente avec sa propre copie, d'où des gestes qui renaissaient. Faire
   travailler deux onglets ensemble est possible mais délicat ; n'en laisser
   travailler qu'un supprime le problème à la racine.

   LA RÈGLE.
     · Le dernier onglet ouvert prend la main : il inscrit son identifiant
       dans le stockage (`<surface>::onglet-qui-tient-la-main`).
     · Un onglet qui voit un autre identifiant à cette place (l'événement
       `storage`, ou au retour sur l'onglet si l'événement s'est perdu) se met
       en pause : il le note dans SA session (`sessionStorage`) et se
       recharge. Rechargé en pause, il ne lit rien, n'écrit rien, n'envoie
       rien : ni magasins, ni synchronisation, ni file d'attente. Il n'affiche
       que l'écran « Le Trône est ouvert dans un autre onglet ».
     · « Utiliser ici » retire la pause et recharge : l'onglet repart de zéro,
       relit le serveur ET la file d'attente du disque, et prend la main à son
       tour ; l'autre se met en pause.
   Seul le Trône appelle `prendsLaMain` (main.tsx) : les autres surfaces ne
   sont pas concernées. */

const CLE_PAUSE = 'mnd_onglet_en_pause';
const cleDeLaMain = (surface: string): string => `${surface}::onglet-qui-tient-la-main`;

const lisLaPause = (): boolean => {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CLE_PAUSE) === '1'; } catch { return false; }
};

/* Lue UNE fois, au chargement du module : ce module est importé par le
   magasin (store.ts), donc avant qu'aucun magasin ni aucune synchronisation
   n'existe. Un onglet rechargé en pause ne démarre jamais rien. */
let enPause = lisLaPause();
const moi = `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** Cet onglet est en pause : il ne doit rien écrire, ni rien envoyer. */
export const ongletEnPause = (): boolean => enPause;

/** Met cet onglet en pause, et le recharge pour qu'il s'arrête vraiment. */
export function metsCetOngletEnPause(): void {
  if (enPause) return;
  enPause = true;
  let note = false;
  try { sessionStorage.setItem(CLE_PAUSE, '1'); note = true; } catch { /* voir plus bas */ }
  /* La pause n'a pas pu se noter : recharger ferait repartir l'onglet comme
     neuf, qui reprendrait la main, et les deux se la renverraient sans fin.
     Il reste donc ouvert, mais muet : `enPause` arrête déjà toute écriture. */
  if (note) window.location.reload();
}

/** « Utiliser ici » : l'onglet repart de zéro et prend la main. */
export function reprendsLaMain(): void {
  try { sessionStorage.removeItem(CLE_PAUSE); } catch { /* rien à faire de plus */ }
  window.location.reload();
}

/** Qui tient la main, d'après le stockage : un identifiant, ou rien. */
const quiTientLaMain = (surface: string): string | undefined => {
  try {
    const v = JSON.parse(localStorage.getItem(cleDeLaMain(surface)) ?? 'null') as { id?: unknown } | null;
    return typeof v?.id === 'string' ? v.id : undefined;
  } catch { return undefined; }
};

/** Cet onglet prend la main pour `surface`, et surveille qu'on ne la lui prenne pas.
    Un onglet en pause ne la prend pas : il attend « Utiliser ici ». */
export function prendsLaMain(surface: string): void {
  if (enPause) return;
  const cle = cleDeLaMain(surface);
  try { localStorage.setItem(cle, JSON.stringify({ id: moi, le: new Date().toISOString() })); } catch { return; }
  /* ON RELIT LA CASE, ON NE CROIT PAS L'ÉVÉNEMENT : deux onglets ouverts à la
     même seconde s'écrivent l'un par-dessus l'autre, et c'est le dernier
     inscrit qui garde la main. Chacun compare la case à son identifiant. */
  const verifie = (): void => {
    if (enPause) return;
    const id = quiTientLaMain(surface);
    if (id && id !== moi) metsCetOngletEnPause();
  };
  window.addEventListener('storage', (e: StorageEvent) => { if (e.key === cle || e.key === null) verifie(); });
  /* L'événement peut se perdre (onglet gelé par le navigateur, téléphone en
     veille) : au retour sur l'onglet, on regarde. */
  window.addEventListener('focus', verifie);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) verifie(); });
}
