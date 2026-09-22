/* L'ARRIVÉE D'UNE EMPLOYÉE, LA PART QUI SE VÉRIFIE — 22 septembre 2026.

   « Ça sert à quoi de confirmer un compte avec le code à six chiffres et avoir
   toujours un compte non rattaché ? » (Yéman). Le geste est inversé : la
   direction prépare la fiche AVANT l'arrivée, et la recrue se rattache d'elle-
   même à la place qui l'attend. Maquette `public/maquette-l-arrivee-d-une-
   employee.html`.

   POURQUOI UN MODULE À PART, SANS ÉCRAN NI RÉSEAU. Les mêmes règles sont
   écrites DEUX FOIS : ici pour ce que la direction voit, et en SQL dans la
   migration 0109 pour ce que le serveur autorise. Deux écritures qui divergent,
   c'est un écran qui promet une porte ouverte devant un serveur qui refuse, ou
   l'inverse, et personne ne comprend pourquoi. Ces fonctions-là se vérifient
   donc au harnais, et la migration reprend mot pour mot leurs seuils.

   ⚠ TOUTE MODIFICATION ICI SE REPORTE DANS 0109, et réciproquement. */

/** Une invitation périme au bout de trente jours. Une adresse préparée et
    jamais utilisée est une porte laissée entrouverte sur une recrue qui n'est
    finalement pas venue. Le même nombre est écrit dans 0109. */
export const JOURS_DE_VALIDITE = 30;

/** Les seuls rôles qui s'invitent. `souverain` ne s'invite PAS : donner les
    pleins pouvoirs reste un geste délibéré depuis Accès & personnel, jamais
    l'effet d'un courrier qu'on a écrit trop vite. */
export const ROLES_QUI_S_INVITENT = ['gerant', 'maitre'] as const;
export type RoleDAcces = (typeof ROLES_QUI_S_INVITENT)[number];

/** Ce que l'arrivée regarde d'une fiche du personnel. Volontairement réduit :
    ce module ne doit rien savoir de la paie ni des rendez-vous. */
export type FicheAttendue = {
  compteMail?: string;
  email?: string;
  roleDAcces?: string;
  inviteeLe?: string;
  entreeLe?: string;
};

export type EtatDeLArrivee = 'a-preparer' | 'invitee' | 'perimee' | 'entree';

/** L'ADRESSE QUI FAIT FOI, dans la graphie du serveur. Celle du compte
    d'abord, celle de contact en repli, détourée et en minuscules. C'est mot
    pour mot `adresseDe` (equipe/data.ts), `est_ma_fiche` (0090) et
    `fiche_qui_mattend` (0109) : trois lectures différentes d'une adresse
    donneraient trois personnes différentes. */
export const adresseDArrivee = (f: FicheAttendue): string =>
  ((f.compteMail ?? '').trim() || (f.email ?? '').trim()).toLowerCase();

/** Jours pleins écoulés entre deux jours ISO. Rend null si l'un des deux ne
    se lit pas : une date illisible ne doit jamais valoir « aujourd'hui », ce
    qui rouvrirait une invitation périmée. */
export const joursEcoules = (depuisIso: string, jusquIso: string): number | null => {
  const a = Date.parse(`${(depuisIso ?? '').slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${(jusquIso ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

/** OÙ EN EST CETTE PERSONNE entre la décision de la direction et sa première
    connexion. Quatre états, jamais deux à la fois. L'ordre des questions
    compte : une fiche déjà entrée ne redevient jamais une invitation, même si
    l'invitation a péri entre-temps. */
export const etatDeLArrivee = (f: FicheAttendue, aujourdHuiIso: string): EtatDeLArrivee => {
  if ((f.entreeLe ?? '').trim()) return 'entree';
  const invitee = (f.inviteeLe ?? '').trim();
  const role = (f.roleDAcces ?? '').trim();
  if (!adresseDArrivee(f) || !invitee || !(ROLES_QUI_S_INVITENT as readonly string[]).includes(role)) {
    return 'a-preparer';
  }
  const age = joursEcoules(invitee, aujourdHuiIso);
  if (age === null || age > JOURS_DE_VALIDITE) return 'perimee';
  return 'invitee';
};

/** Distance d'édition, bornée : on s'arrête dès qu'elle dépasse le seuil, car
    au-delà la réponse ne sert plus à rien. */
const distance = (a: string, b: string, seuil: number): number => {
  if (Math.abs(a.length - b.length) > seuil) return seuil + 1;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout);
      courante.push(v);
      if (v < minimum) minimum = v;
    }
    if (minimum > seuil) return seuil + 1;
    precedente = courante;
  }
  return precedente[b.length];
};

/** DEUX ADRESSES QUI SE RESSEMBLENT SANS ÊTRE LA MÊME. Sert à rompre le
    silence le jour où la direction se trompe d'une lettre en préparant une
    entrée : la recrue s'inscrit, rien ne se rattache, elle tombe dans la file
    et personne ne comprend pourquoi. Le même silence que « acceuil@ » écrit
    pour « accueil@ ».

    Ce n'est qu'un INDICE montré à la direction, jamais un rattachement
    automatique : une ressemblance ne prouve rien, c'est un humain qui tranche.

    LA GARDE PORTE SUR LA BOÎTE, PAS SUR L'ADRESSE ENTIÈRE. Une première
    version écartait les adresses de moins de six caractères ; `a@x.bj` en fait
    exactement six, donc `b@x.bj` passait pour sa parente alors que ce sont deux
    personnes différentes. Ce qui compte n'est pas la longueur totale, que le
    domaine gonfle, mais celle de la boîte : une boîte d'une seule lettre est
    trop courte pour qu'on devine quoi que ce soit, tandis que `ra` et `r.a`
    sont bien la même main qui hésite. */
export const seRessemblent = (a: string, b: string): boolean => {
  const x = (a ?? '').trim().toLowerCase();
  const y = (b ?? '').trim().toLowerCase();
  if (!x || !y || x === y) return false;
  if (!x.includes('@') || !y.includes('@')) return false;
  const boite = (s: string) => s.slice(0, s.lastIndexOf('@'));
  if (Math.min(boite(x).length, boite(y).length) < 2) return false;
  return distance(x, y, 2) <= 2;
};

/** LE MOT QU'ELLE REÇOIT, prêt à partir par WhatsApp. Le texte dit l'adresse
    EXACTE à utiliser, parce que c'est elle qui sert de serrure : une autre
    adresse la renverrait dans la file d'attente sans rien expliquer. */
export const messageDeLInvitation = (
  { prenom, adresse, adresseDuTrone }: { prenom: string; adresse: string; adresseDuTrone: string },
): string => {
  const p = (prenom ?? '').trim().split(/\s+/)[0] ?? '';
  return [
    p ? `Bonjour ${p},` : 'Bonjour,',
    '',
    'Votre place est prête dans Le Trône.',
    '',
    `Ouvrez ${adresseDuTrone} et créez votre compte avec cette adresse exactement :`,
    adresse,
    '',
    'Vous recevrez un code à six chiffres par e-mail. Une fois saisi, vous entrez',
    'directement, tout est déjà prêt.',
  ].join('\n');
};
