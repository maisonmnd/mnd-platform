/* ══ ENTRE DEUX SÉANCES — 15 octobre 2026 ═════════════════════════════
   « Créer un système de suivi entre deux rendez-vous pour adresser les
   problèmes qu'un client peut avoir jusqu'à son prochain rendez-vous sur ses
   cheveux (cheveux secs, cheveux cassants, locks inégales) » (Yéman).
   Maquette EfhgzxjA… validée (« construis »), avec ses choix : deux points
   d'étape (une semaine après la séance, une semaine avant la suivante), la
   maîtresse de la dernière séance répond, Santé sous 24 h et À voir sous
   48 h, la photo facultative, la Maison PROPOSE d'avancer le rendez-vous et
   la cliente choisit l'heure, les réponses écrites en brouillons que la
   direction valide ; Ma Couronne pour celles qui ont l'app, WhatsApp pour
   les autres (un modèle Meta, payant par message).

   TROIS NIVEAUX. Conseil : la réponse validée part tout de suite. À voir :
   la maîtresse rappelle. Santé : AUCUN conseil écrit, on rappelle, et l'on
   oriente vers un médecin si besoin (comme les mots de santé de l'automate
   WhatsApp). Aucune réponse ne promet un résultat, aucune ne pose un
   diagnostic.

   CE FICHIER EST PUR : Ma Couronne, le Trône, l'automate et le banc lisent
   les mêmes règles. */

export const NOM_ENTRE_DEUX = 'Entre deux séances';
export const TABLE_DES_SIGNALEMENTS = 'signalements';
export const TABLE_DES_REPONSES = 'entre_deux_reponses';
export const COMPARTIMENT_DES_PHOTOS = 'entre-deux';

export type Niveau = 'conseil' | 'voir' | 'sante';
export const NIVEAUX: Record<Niveau, string> = { conseil: 'Conseil', voir: 'À voir', sante: 'Santé' };
const RANG: Record<Niveau, number> = { conseil: 0, voir: 1, sante: 2 };
/** Le délai de la Maison, en heures : Santé 24, À voir 48 (choix du 15 octobre 2026) ; un conseil se regarde dans la semaine. */
export const DELAI_HEURES: Record<Niveau, number> = { sante: 24, voir: 48, conseil: 168 };

export type CleDeSouci = 'seches' | 'cassantes' | 'inegales' | 'pousse' | 'odeur' | 'gratte' | 'chute' | 'autre';
export type Souci = {
  cle: CleDeSouci;
  dit: string;
  niveau: Niveau;
  /** Les mots qui le reconnaissent dans un message, sans accents : un mot entier, ou une racine marquée `*`. */
  mots: readonly string[];
  /** Le brouillon de la réponse : rien ne part avant la validation de la direction. */
  brouillon: string;
  /** Ce qui peut suivre, pour la maîtresse. */
  suite: string;
  /** La Maison propose d'avancer le rendez-vous. */
  avancer?: boolean;
};
export const SOUCIS: readonly Souci[] = [
  { cle: 'seches', dit: 'Sèches', niveau: 'conseil', mots: ['sec', 'secs', 'seche', 'seches', 'sechent', 'deshydrat*', 'tirent', 'tire'],
    brouillon: 'Nourrir : quelques gouttes d’huile légère sur le cuir chevelu, deux fois par semaine, en massage lent. Sécher entièrement après chaque lavage.',
    suite: 'Le Soin Hydratant DÀNDÀN à la prochaine séance' },
  { cle: 'cassantes', dit: 'Cassantes, qui s’amincissent', niveau: 'voir', mots: ['cass*', 'aminci*', 'fines', 'fragile*', 'coupent'],
    brouillon: 'Votre maîtresse vous rappelle. En attendant : pas d’attache serrée, et un foulard en satin la nuit.',
    suite: 'Un diagnostic KÒKÒ, une reconstruction GBÌGBÌ', avancer: true },
  { cle: 'inegales', dit: 'Inégales, racines qui s’emmêlent', niveau: 'voir', mots: ['inegal*', 'emmel*', 'colle', 'collent', 'fusion*'],
    brouillon: 'Votre maîtresse regarde et vous rappelle. Ne séparez pas les racines vous-même.',
    suite: 'Avancer la reprise, une reprise frontale', avancer: true },
  { cle: 'pousse', dit: 'Racines qui ont trop poussé', niveau: 'conseil', mots: ['pousse', 'poussent', 'repousse', 'defait*', 'defont'],
    brouillon: 'C’est le signe que la reprise approche. La Maison peut avancer votre rendez-vous : choisissez l’heure qui vous va.',
    suite: 'Avancer le rendez-vous', avancer: true },
  { cle: 'odeur', dit: 'Odeur, séchage long', niveau: 'conseil', mots: ['odeur*', 'sent', 'humide', 'sechage'],
    brouillon: 'Sceller : séchez entièrement avant de nouer, et jamais de couronne humide sous le foulard.',
    suite: 'La Purification WÈWÈ si cela dure' },
  { cle: 'gratte', dit: 'Ça gratte, plaques, rougeurs', niveau: 'sante', mots: ['gratt*', 'demang*', 'plaque*', 'rougeur*', 'irrit*', 'croute*', 'pellicule*'],
    brouillon: 'Merci de nous l’avoir dit. Votre maîtresse vous rappelle. En attendant, ne grattez pas et ne mettez aucun produit nouveau.',
    suite: 'Un médecin si besoin ; aucun conseil écrit' },
  { cle: 'chute', dit: 'Chute, trous, douleur', niveau: 'sante', mots: ['chute', 'tombent', 'perds', 'trou', 'trous', 'douleur*', 'doulour*', 'saign*', 'brule*', 'infection*'],
    brouillon: 'Merci de nous l’avoir dit. La Maison vous rappelle très vite.',
    suite: 'Un médecin si besoin ; aucun conseil écrit' },
  { cle: 'autre', dit: 'Autre chose', niveau: 'voir', mots: [],
    brouillon: 'Merci de nous l’avoir dit. Votre maîtresse vous répond.',
    suite: 'Selon ce qu’elle dit' },
];
export const souciDe = (cle: string): Souci | undefined => SOUCIS.find((s) => s.cle === cle);

/** Le niveau d'un signalement : le plus grave de ses soucis. Recalculé partout,
    jamais cru sur parole (la cliente écrit sa ligne elle-même). */
export function niveauDe(cles: readonly string[]): Niveau {
  let n: Niveau = 'conseil';
  for (const c of cles) { const s = souciDe(c); if (s && RANG[s.niveau] > RANG[n]) n = s.niveau; }
  return n;
}
export const echeanceDe = (niveau: Niveau, quand: string): string =>
  new Date(Date.parse(quand) + DELAI_HEURES[niveau] * 3_600_000).toISOString();
export const enRetard = (s: { etat: EtatDuSignalement; soucis: readonly string[]; quand: string }, maintenant: string): boolean =>
  s.etat === 'ouvert' && Date.parse(echeanceDe(niveauDe(s.soucis), s.quand)) < Date.parse(maintenant);

/** La réponse que la cliente reçoit : en Santé, jamais un conseil ; sinon la
    réponse VALIDÉE de chaque souci, ou, à défaut, un simple accusé. */
export const ACCUSE = 'Merci de nous l’avoir dit. Votre maîtresse vous répond.';
export const ACCUSE_SANTE = 'Merci de nous l’avoir dit. Votre maîtresse vous rappelle. En attendant, ne mettez aucun produit nouveau.';
export function reponseAuSignalement(cles: readonly string[], validees: Partial<Record<string, string>>): string[] {
  if (niveauDe(cles) === 'sante') return [ACCUSE_SANTE];
  const textes = [...new Set(cles.map((c) => (validees[c] ?? '').trim()).filter(Boolean))];
  return textes.length ? textes : [ACCUSE];
}
export const proposeDAvancer = (cles: readonly string[]): boolean => cles.some((c) => souciDe(c)?.avancer);

/* ── LE SIGNALEMENT ── */
export type Canal = 'couronne' | 'whatsapp' | 'trone';
export type EtatDuSignalement = 'ouvert' | 'traite';
export type Signalement = {
  id: string;
  branchId: string;
  clientId: string;
  /** Les soucis touchés ; vide quand elle répond « tout va bien ». */
  soucis: CleDeSouci[];
  texte?: string;
  /** Le chemin de la photo dans le compartiment privé. */
  photo?: string;
  canal: Canal;
  quand: string;
  /** Le point d'étape auquel elle répond, s'il y en a un. */
  point?: string;
  /** « Tout va bien » : une réponse, pas un souci. */
  bien?: boolean;
  /** La séance d'avant, et sa maîtresse, qui répond. */
  apptId?: string;
  maitre?: string;
  etat: EtatDuSignalement;
  /** Ce que la cliente a reçu tout de suite. */
  reponse?: string;
  traiteLe?: string;
  traitePar?: string;
  note?: string;
};

/* ── LES POINTS D'ÉTAPE ── */
export const JOURS_APRES = 7;
export const JOURS_AVANT = 7;
/** Une semaine après la séance, une semaine avant la suivante. Le second
    n'existe que si la séance suivante est assez loin (14 jours au moins
    entre les deux) : sinon les deux questions tomberaient ensemble. */
export type PointDEtape = { cle: string; type: 'apres' | 'avant'; date: string; apptId: string; seance: string };
type SeanceLue = { id: string; date: string; status: string; clientId?: string; master?: string };
const jourPlus = (iso: string, j: number): string => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + j); return d.toISOString().slice(0, 10);
};
const ecartJours = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export function derniereEtProchaine(seances: readonly SeanceLue[], aujourdhui: string): { derniere?: SeanceLue; prochaine?: SeanceLue } {
  const derniere = seances.filter((s) => s.status === 'honoré' && s.date <= aujourdhui).sort((a, b) => b.date.localeCompare(a.date))[0];
  const prochaine = seances.filter((s) => (s.status === 'confirmé' || s.status === 'en attente') && s.date > aujourdhui).sort((a, b) => a.date.localeCompare(b.date))[0];
  return { derniere, prochaine };
}
export function pointsDEtape(seances: readonly SeanceLue[], aujourdhui: string): PointDEtape[] {
  const { derniere, prochaine } = derniereEtProchaine(seances, aujourdhui);
  const out: PointDEtape[] = [];
  if (derniere) out.push({ cle: `pe-${derniere.id}-apres`, type: 'apres', date: jourPlus(derniere.date, JOURS_APRES), apptId: derniere.id, seance: derniere.date });
  if (prochaine && (!derniere || ecartJours(derniere.date, prochaine.date) >= JOURS_APRES + JOURS_AVANT)) {
    out.push({ cle: `pe-${prochaine.id}-avant`, type: 'avant', date: jourPlus(prochaine.date, -JOURS_AVANT), apptId: prochaine.id, seance: prochaine.date });
  }
  return out;
}
/** Le point à poser aujourd'hui : arrivé, pas encore répondu, et pas trop vieux
    (une semaine pour répondre ; ensuite, le suivant prend la place). */
export function pointDuJour(seances: readonly SeanceLue[], aujourdhui: string, dejaRepondus: ReadonlySet<string>): PointDEtape | undefined {
  return pointsDEtape(seances, aujourdhui)
    .filter((p) => p.date <= aujourdhui && ecartJours(p.date, aujourdhui) < 7 && !dejaRepondus.has(p.cle))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/* ── LA FILE DU TRÔNE ── */
/** Santé d'abord, puis À voir, puis les conseils ; à niveau égal, l'échéance la plus proche. */
export function fileRangee<T extends Pick<Signalement, 'soucis' | 'quand' | 'etat' | 'bien'>>(liste: readonly T[]): T[] {
  return liste.filter((s) => s.etat === 'ouvert' && !s.bien).sort((a, b) =>
    RANG[niveauDe(b.soucis)] - RANG[niveauDe(a.soucis)]
    || echeanceDe(niveauDe(a.soucis), a.quand).localeCompare(echeanceDe(niveauDe(b.soucis), b.quand)));
}
/** Ce qui s'est dit depuis la séance d'avant : pour le bilan de la suivante. */
export function depuisLaDerniereSeance<T extends Pick<Signalement, 'clientId' | 'quand'>>(liste: readonly T[], clientId: string, depuis: string | undefined, jusqua: string): T[] {
  return liste.filter((s) => s.clientId === clientId && (!depuis || s.quand.slice(0, 10) > depuis) && s.quand.slice(0, 10) <= jusqua)
    .sort((a, b) => a.quand.localeCompare(b.quand));
}

/* ── WHATSAPP : reconnaître un souci dans ses mots ── */
const sansAccents = (t: string): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function soucisDuTexte(texte: string): CleDeSouci[] {
  const t = ` ${sansAccents(texte).replace(/[^a-z0-9 ]+/g, ' ')} `;
  return SOUCIS.filter((s) => s.mots.some((m) => (m.endsWith('*') ? t.includes(` ${m.slice(0, -1)}`) : t.includes(` ${m} `)))).map((s) => s.cle);
}

/** Qui reçoit le point d'étape sur WhatsApp : celles qui n'ont pas l'app (aucun compte Ma Couronne). */
export const surWhatsApp = (c: { authUserId?: string | null }): boolean => !c.authUserId;

/* ══ LOT 2, SUR WHATSAPP — 17 octobre 2026 ═══════════════════════════════
   Les deux modèles Meta sont approuvés : `point_apres_seance` (Utilitaire,
   « comment vont vos locks ? », Tout va bien · J'ai un souci) et
   `point_avant_seance` (Marketing, reformulé le 17 octobre à sa demande :
   « un soin, une coloration, une coiffure pour une occasion, ou autre
   chose ? »). `rappels-j1` les envoie, `whatsapp-webhook` lit les réponses ;
   les deux portent une copie marquée de ces règles, que
   `scripts/verifie-points-d-etape` confronte à celles-ci.

   LES CODES DES BOUTONS NE COMMENCENT JAMAIS PAR « MND: » : l'automate ne
   prend que les siens, et laisse ceux-ci au webhook. */
export const MODELE_POINT_APRES = 'point_apres_seance';
export const MODELE_POINT_AVANT = 'point_avant_seance';

export type EnvieAvant = 'soin' | 'coloration' | 'coiffure' | 'autre';
/** Les quatre boutons du message d'avant séance, dans l'ordre du modèle. */
export const ENVIES_AVANT: readonly { cle: EnvieAvant; titre: string; dit: string }[] = [
  { cle: 'soin', titre: 'Un soin', dit: 'un soin' },
  { cle: 'coloration', titre: 'Une coloration', dit: 'une coloration' },
  { cle: 'coiffure', titre: 'Une coiffure spéciale', dit: 'une coiffure spéciale' },
  { cle: 'autre', titre: 'Autre chose', dit: 'autre chose' },
];

export const payloadApres = (apptId: string, geste: 'bien' | 'souci'): string => `${geste === 'bien' ? 'POINT_BIEN' : 'POINT_SOUCI'}:${apptId}`;
export const payloadAvant = (apptId: string, envie: EnvieAvant): string => `POINT_AVANT:${apptId}:${envie}`;
export const payloadListe = (apptId: string, cle: CleDeSouci): string => `POINT_LISTE:${apptId}:${cle}`;

export type ReponseAuPoint =
  | { geste: 'bien' | 'souci'; apptId: string }
  | { geste: 'liste'; apptId: string; cle: CleDeSouci }
  | { geste: 'avant'; apptId: string; envie: EnvieAvant };
/** Ce qu'un bouton ou une ligne de liste rapporte. Tout autre code : null. */
export function lisLaReponseAuPoint(id: string): ReponseAuPoint | null {
  const m = String(id ?? '').match(/^POINT_(BIEN|SOUCI|LISTE|AVANT):([A-Za-z0-9_-]{1,80})(?::([a-z]{1,20}))?$/);
  if (!m) return null;
  const [, quoi, apptId, arg] = m;
  if (quoi === 'BIEN' || quoi === 'SOUCI') return arg ? null : { geste: quoi === 'BIEN' ? 'bien' : 'souci', apptId };
  if (quoi === 'LISTE') return SOUCIS.some((s) => s.cle === arg) ? { geste: 'liste', apptId, cle: arg as CleDeSouci } : null;
  return ENVIES_AVANT.some((e) => e.cle === arg) ? { geste: 'avant', apptId, envie: arg as EnvieAvant } : null;
}

/** Les titres de la liste WhatsApp : vingt-quatre signes au plus (Meta). Le
    libellé entier part en description (soixante-douze au plus). */
export const TITRE_COURT: Record<CleDeSouci, string> = {
  seches: 'Sèches',
  cassantes: 'Cassantes',
  inegales: 'Inégales, emmêlées',
  pousse: 'Racines trop longues',
  odeur: 'Odeur, séchage long',
  gratte: 'Ça gratte, rougeurs',
  chute: 'Chute, trous, douleur',
  autre: 'Autre chose',
};
export const MOT_DE_LA_LISTE = 'Qu’est-ce qui se passe ? Choisissez ce qui ressemble le plus à ce que vous voyez.';
export const BOUTON_DE_LA_LISTE = 'Voir les soucis';
export const lignesDeLaListe = (apptId: string): { id: string; titre: string; description: string }[] =>
  SOUCIS.map((s) => ({ id: payloadListe(apptId, s.cle), titre: TITRE_COURT[s.cle], description: s.dit.slice(0, 72) }));

/** « Tout va bien » : le même merci que dans Ma Couronne. */
export const MERCI_BIEN = 'Merci ! Bonne nouvelle. À votre prochaine séance.';
/** Ce qu'elle reçoit après avoir choisi un souci dans la liste. */
export function reponseAuSouciDuPoint(cle: CleDeSouci, validees: Partial<Record<string, string>>): string[] {
  const base = reponseAuSignalement([cle], validees);
  if (niveauDe([cle]) === 'sante') return base;
  const plus: string[] = [];
  if (cle === 'autre') plus.push('Dites-nous en quelques mots ce que vous voyez, ici même.');
  if (proposeDAvancer([cle])) plus.push('Si vous le souhaitez, nous pouvons avancer votre prochaine séance : dites-le-nous ici.');
  return [...base, ...plus];
}
/** Ce qu'elle reçoit après avoir dit son envie, avant la séance (`jour` avec l'année). */
export function reponseAvant(appel: string, envie: EnvieAvant, jour: string): string {
  if (envie === 'autre') return `Merci, ${appel} ! Dites-nous en quelques mots ce qui vous ferait plaisir pour votre séance du ${jour} : nous préparons votre venue.`;
  const dit = ENVIES_AVANT.find((e) => e.cle === envie)?.dit ?? 'votre envie';
  return `Merci, ${appel} ! Nous notons votre envie : ${dit}. Nous vous écrivons très vite pour préparer votre séance du ${jour}.`;
}

/** QUI REÇOIT LE POINT SUR WHATSAPP : pas de compte Ma Couronne (l'app pose
    déjà la question), une fiche vivante, un numéro, et une tête qui se paie
    elle-même : l'enfant d'un foyer ne reçoit pas « Bonjour Kèli » sur le
    téléphone de sa mère. */
export function recoitLePointSurWhatsApp(
  c: { id: string; authUserId?: string | null; archived?: boolean; phone?: string; familyId?: string },
  familles: readonly { id: string; payerClientId?: string }[],
): boolean {
  if (!surWhatsApp(c) || c.archived || !String(c.phone ?? '').replace(/\D/g, '')) return false;
  const fam = c.familyId ? familles.find((f) => f.id === c.familyId) : undefined;
  return !fam?.payerClientId || fam.payerClientId === c.id;
}
