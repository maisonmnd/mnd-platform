/* ══ LA SONNETTE DE LA MAISON — 14 septembre 2026 ════════════════════

   « Je voudrais une sonnette quand un nouveau message vient dans le Trône »
   (Yéman). Maquette `public/maquette-rattraper-un-message.html`, validée.

   AUCUN FICHIER SON. Deux notes se fabriquent dans le navigateur, en une
   douzaine de lignes : rien à télécharger, rien à héberger, rien à charger au
   démarrage, et pas un octet de plus dans le paquet. Un fichier audio pour
   deux notes serait la plus mauvaise affaire du dépôt.

   DEUX NOTES MONTANTES, DOUCES, COURTES. Une sonnette de salon n'est pas une
   alarme : elle se remarque sans faire sursauter une cliente installée dans
   le fauteuil. La deuxième note monte d'une quinte — c'est ce qui la fait
   entendre comme une question, pas comme un avertissement.

   LE NAVIGATEUR REFUSE TOUT SON avant que quelqu'un ait touché la page, et
   c'est une protection contre les publicités sonores : elle s'applique à nous
   aussi. La sonnette s'arme donc au PREMIER GESTE de la journée, quel qu'il
   soit, et jusque-là l'écran ne promet jamais un son qu'il ne peut pas jouer.
   `laSonnetteEstArmee()` dit la vérité là-dessus. */

/** LES DEUX NOTES, en hertz. Un la et le mi au-dessus : une quinte juste,
    l'intervalle le plus consonant après l'octave, celui des cloches. */
const NOTES = [880, 1318.5] as const;

/** La durée d'une note, en secondes. Plus court se perd dans le bruit du
    salon ; plus long devient une sonnerie de téléphone. */
const DUREE = 0.16;

/** Le volume, sur un. La sonnette ne couvre pas une conversation. */
const VOLUME = 0.14;

let contexte: AudioContext | null = null;
let armee = false;

/** Le contexte audio du navigateur, créé une seule fois et à la demande.
    Le créer au chargement du module le poserait « suspendu » sur tous les
    postes, y compris ceux qui ne verront jamais un message. */
const leContexte = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (contexte) return contexte;
  const C = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try { contexte = new C(); } catch { return null; }
  return contexte;
};

/** LA SONNETTE EST-ELLE EN ÉTAT DE SONNER ? L'écran s'en sert pour ne pas
    promettre un son que le navigateur refusera. */
export const laSonnetteEstArmee = (): boolean => armee;

/** ARMER LA SONNETTE — à appeler au premier geste de l'utilisateur, quel
    qu'il soit. Sans geste, un navigateur laisse le contexte « suspendu » et
    toute note jouée se perd en silence, sans erreur.

    IDEMPOTENT ET SANS BRUIT : on peut l'appeler à chaque clic de la journée,
    elle ne fait quelque chose que la première fois. */
export function armeLaSonnette(): void {
  if (armee) return;
  const ctx = leContexte();
  if (!ctx) return;
  /* `resume` rend une promesse ; on ne l'attend pas, mais on ne se déclare
     armé que lorsqu'elle a tenu — sinon l'écran dirait « le son est prêt »
     alors qu'il ne l'est pas encore. */
  void ctx.resume().then(() => { armee = ctx.state === 'running'; }).catch(() => { armee = false; });
}

/** SONNER. Ne fait rien si le navigateur n'a pas encore laissé la main : ce
    n'est pas une erreur, c'est l'état normal avant le premier clic. */
export function sonne(): void {
  const ctx = leContexte();
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  NOTES.forEach((freq, i) => {
    const debut = t0 + i * (DUREE * 0.78);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    /* UNE SINUSOÏDE, ET RIEN D'AUTRE. Les autres formes portent des
       harmoniques qui rendent la note métallique dans un haut-parleur de
       tablette — et une sonnette métallique, on la coupe le jour même. */
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, debut);
    /* L'ATTAQUE ET LA CHUTE SE DESSINENT À LA MAIN. Un son qui commence et
       s'arrête net produit un claquement — c'est la marche d'escalier dans
       l'onde que l'oreille entend, pas la note. */
    g.gain.setValueAtTime(0, debut);
    g.gain.linearRampToValueAtTime(VOLUME, debut + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, debut + DUREE);
    o.connect(g).connect(ctx.destination);
    o.start(debut);
    o.stop(debut + DUREE + 0.02);
  });
}

/* ══ LE SILENCE DE LA NUIT ═══════════════════════════════════════════

   Une tablette oubliée allumée ne doit pas sonner à deux heures du matin. La
   sonnette se tait hors des heures du salon — le compte de la cloche, lui,
   ne se tait jamais : c'est le SON qu'on coupe, pas l'information. */

/** La sonnette doit-elle se taire à cette heure-ci ?

    LES BORNES SONT CELLES DU SALON, passées par l'appelant. Absentes, on ne
    présume rien et l'on sonne : une sonnette qui se tairait sans qu'on lui ait
    dit quand serait une sonnette cassée. */
export function cestLaNuit(
  maintenant: Date, ouvreA?: string, fermeA?: string,
): boolean {
  if (!/^\d{1,2}:\d{2}$/.test(ouvreA ?? '') || !/^\d{1,2}:\d{2}$/.test(fermeA ?? '')) return false;
  const enMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const maintenantMin = maintenant.getHours() * 60 + maintenant.getMinutes();
  const ouvre = enMinutes(ouvreA as string);
  const ferme = enMinutes(fermeA as string);
  /* UN SALON QUI FERME APRÈS MINUIT enjambe le jour : ses heures ne se
     comparent pas comme un intervalle ordinaire. Rare, mais une soirée de
     mariage suffit à le rencontrer. */
  if (ferme <= ouvre) return maintenantMin < ouvre && maintenantMin >= ferme;
  return maintenantMin < ouvre || maintenantMin >= ferme;
}
