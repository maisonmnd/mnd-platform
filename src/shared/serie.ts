/* ══ LA SAISIE EN SÉRIE — 5 septembre 2026 (maquette validée) ═══════

   « Je veux saisir tous mes RDV en 2025. Est-ce que tu peux me trouver un
   système facile pour remplir des RDV in bulk ? Et saisir les dates
   facilement ? » (Yéman).

   RENTRER UNE ANNÉE LIGNE À LIGNE NE SE FAIT PAS. Cinquante rituels par tête,
   trois cents pour la Maison : au dixième on abandonne, et l'historique reste
   dans un cahier. Or c'est lui qui rend une comparaison d'une année sur
   l'autre possible.

   TOUT CE QUI EST ICI EST PUR, et jugé par `verifie-serie`. Rien n'écrit :
   l'écran décide, après relecture. Une saisie en masse qui écrirait sans
   qu'on ait vu ne serait pas un outil, ce serait un pari. */

/* ── LE LECTEUR DE DATES ────────────────────────────────────────────
   « Saisir les dates facilement » : la Maison a un cahier sous les yeux et
   tape ce qu'elle y lit. Exiger un format, c'est demander de traduire cinquante
   fois — et c'est en traduisant qu'on se trompe.

   ON NE DEVINE JAMAIS L'AMBIGU. `03/04` reste jour/mois, jamais mois/jour :
   choisir à la place de quelqu'un décale une année entière d'un mois, et
   personne ne le voit avant les chiffres de fin d'année. */

const MOIS_FR = [
  ['janvier', 'janv', 'jan'],
  ['février', 'fevrier', 'févr', 'fevr', 'fev'],
  ['mars'],
  ['avril', 'avr'],
  ['mai'],
  ['juin'],
  ['juillet', 'juil'],
  ['août', 'aout'],
  ['septembre', 'sept', 'sep'],
  ['octobre', 'oct'],
  ['novembre', 'nov'],
  ['décembre', 'decembre', 'déc', 'dec'],
];

const sansAccent = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const moisDuMot = (mot: string): number | null => {
  const m = sansAccent(mot).replace(/\.$/, '');
  for (let i = 0; i < MOIS_FR.length; i += 1) {
    if (MOIS_FR[i].some((f) => sansAccent(f) === m)) return i + 1;
  }
  return null;
};

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** Une date existe-t-elle vraiment ? Le 31 février n'est pas une faute de
    frappe qu'on corrige, c'est une ligne à relire. */
const jourValide = (a: number, m: number, j: number): boolean => {
  if (m < 1 || m > 12 || j < 1 || j > 31) return false;
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
};

export type LigneLue = {
  /** Le texte tel qu'il a été tapé — on le rend toujours, pour que la ligne
      rouge dise CE QU'ON A ÉCRIT et non un message générique. */
  brut: string;
  iso?: string;
  /** HH:mm quand la ligne en portait une. */
  heure?: string;
  /** Ce qui reste après la date et l'heure : un nom, une note. */
  reste?: string;
};

/** L'HEURE, DANS TOUTES SES ÉCRITURES : 9h, 9h30, 09:00, 9.30. */
const litLHeure = (t: string): { heure?: string; sans: string } => {
  const m = t.match(/(?:^|\s)(\d{1,2})\s*(?:[h:.](\d{2})?)(?:\s|$)/);
  if (!m) return { sans: t };
  const h = Number(m[1]);
  if (h > 23) return { sans: t };
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return { sans: t };
  return { heure: `${deuxChiffres(h)}:${deuxChiffres(min)}`, sans: (t.slice(0, m.index) + ' ' + t.slice((m.index ?? 0) + m[0].length)).trim() };
};

/** LIRE UNE LIGNE. `anneeParDefaut` sert quand elle n'en porte pas : c'est
    l'année qu'on saisit, et la retaper cinquante fois ne l'apprendrait à
    personne. */
export function litUneLigne(brut: string, anneeParDefaut: number): LigneLue {
  const t = brut.trim();
  if (t === '') return { brut };
  const { heure, sans } = litLHeure(t);

  /* ① 14/02/2025 · 14-02-25 · 14.02.2025 */
  const chiffres = sans.match(/(?:^|\s)(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?(?=\s|$)/);
  if (chiffres) {
    const j = Number(chiffres[1]);
    const m = Number(chiffres[2]);
    let a = chiffres[3] ? Number(chiffres[3]) : anneeParDefaut;
    /* « 25 » veut dire 2025 : personne n'écrit l'an 25 dans un carnet. */
    if (a < 100) a += 2000;
    if (!jourValide(a, m, j)) return { brut };
    const reste = (sans.slice(0, chiffres.index) + ' ' + sans.slice((chiffres.index ?? 0) + chiffres[0].length)).trim();
    return { brut, iso: `${a}-${deuxChiffres(m)}-${deuxChiffres(j)}`, heure, ...(reste ? { reste } : {}) };
  }

  /* ② 14 février · 14 févr. 2025 · 7 mars 2025 */
  const enLettres = sans.match(/(?:^|\s)(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)(?:\s+(\d{4}))?/);
  if (enLettres) {
    const j = Number(enLettres[1]);
    const m = moisDuMot(enLettres[2]);
    if (m === null) return { brut };
    const a = enLettres[3] ? Number(enLettres[3]) : anneeParDefaut;
    if (!jourValide(a, m, j)) return { brut };
    const reste = (sans.slice(0, enLettres.index) + ' ' + sans.slice((enLettres.index ?? 0) + enLettres[0].length)).trim();
    return { brut, iso: `${a}-${deuxChiffres(m)}-${deuxChiffres(j)}`, heure, ...(reste ? { reste } : {}) };
  }

  return { brut };
}

/** Le collage entier, ligne à ligne. Les lignes vides disparaissent, les
    illisibles restent — c'est en les voyant qu'on les corrige. */
export const litLesLignes = (texte: string, anneeParDefaut: number): LigneLue[] =>
  texte.split('\n').map((l) => l.trim()).filter((l) => l !== '')
    .map((l) => litUneLigne(l, anneeParDefaut));

/* ── CE QU'ELLE FAIT D'HABITUDE ─────────────────────────────────────
   « Quand je choisis la cliente je veux voir les rituels qu'elle fait
   habituellement avant de choisir » (Yéman, 5 septembre 2026).

   REPRENDRE UNE ANNÉE, C'EST SE SOUVENIR — et le catalogue compte des dizaines
   de prestations. Chercher dans la liste ce qu'une tête prend chaque fois,
   cinquante fois de suite, c'est là qu'on se trompe de ligne voisine.

   LE CARNET SAIT DÉJÀ. Ce qu'elle a honoré, on le lit ; on ne le devine pas.
   MAIS ON NE CHOISIT PAS À SA PLACE : on montre, la Maison clique. Un rituel
   posé tout seul serait un rituel que personne n'a regardé. */

export type Habitude = {
  /** La signature de la combinaison : les prestations triées. Deux rituels
      composés dans un ordre différent sont le MÊME rituel. */
  cle: string;
  /** Dans l'ordre de la dernière fois — un rituel se lit comme il a été posé. */
  serviceIds: string[];
  fois: number;
  dernierIso: string;
  /** Ce qu'elle a réglé la dernière fois. La Maison s'en sert pour corriger le
      prix d'une ligne quand un tarif a bougé depuis. */
  dernierPrixXof?: number;
};

type RituelLu = {
  clientId: string;
  serviceIds: readonly string[];
  date: string;
  status?: string;
  priceXof?: number;
};

/** LES HABITUDES DE TOUTES LES TÊTES, en une seule passe.
    Le plus souvent honoré d'abord ; à égalité, le plus récent — deux rituels
    vus trois fois chacun, celui de cette année parle mieux que celui d'il y a
    trois ans. */
export function habitudesParTete(
  appts: readonly RituelLu[],
  garde = 5,
): Map<string, Habitude[]> {
  const parTete = new Map<string, Map<string, Habitude>>();
  for (const a of appts) {
    /* UN RITUEL ANNULÉ N'EST PAS UNE HABITUDE : il n'a pas eu lieu. */
    if (a.status === 'annulé' || !a.serviceIds || a.serviceIds.length === 0) continue;
    let vues = parTete.get(a.clientId);
    if (!vues) { vues = new Map(); parTete.set(a.clientId, vues); }
    const cle = [...a.serviceIds].sort().join('+');
    const vue = vues.get(cle);
    if (!vue) {
      vues.set(cle, {
        cle, serviceIds: [...a.serviceIds], fois: 1, dernierIso: a.date, dernierPrixXof: a.priceXof,
      });
      continue;
    }
    vue.fois += 1;
    if (a.date > vue.dernierIso) {
      vue.dernierIso = a.date;
      vue.serviceIds = [...a.serviceIds];
      vue.dernierPrixXof = a.priceXof;
    }
  }
  const sortie = new Map<string, Habitude[]>();
  for (const [id, vues] of parTete) {
    sortie.set(id, [...vues.values()]
      .sort((x, y) => y.fois - x.fois || y.dernierIso.localeCompare(x.dernierIso))
      .slice(0, garde));
  }
  return sortie;
}

/** Les habitudes d'une seule tête. */
export const habitudesDeLaTete = (
  appts: readonly RituelLu[], clientId: string, garde = 5,
): Habitude[] => habitudesParTete(appts, garde).get(clientId) ?? [];

/** LES RYTHMES D'UNE REPRISE D'ANNÉE — 5 septembre 2026.

    « Et quand la personne ne vient que 2 ou 3 fois dans l'année, comment je
    règle sa cadence ? » (Yéman).

    `RYTHMES_ABO` s'arrête à dix semaines, et c'est juste : ce sont les rythmes
    d'une tête SUIVIE, et une formule qui proposerait « toutes les 26 semaines »
    ne serait plus un abonnement. Mais une reprise d'année n'a pas ce
    scrupule — elle raconte ce qui a eu lieu, et beaucoup de têtes ne viennent
    que deux ou trois fois.

    On ajoute donc les rares, ICI SEULEMENT, pour ne pas les faire apparaître
    dans les formules : 13 semaines font quatre venues, 17 en font trois,
    26 en font deux.

    POUR DEUX OU TROIS DATES, LA LISTE RESTE PLUS COURTE : on les tape, on n'a
    pas à trouver le rythme qui les approche. La cadence sert quand la suite est
    longue. */
export const RYTHMES_REPRISE = [4, 5, 6, 7, 8, 10, 13, 17, 26] as const;

/** « 2 fois l'an » — le sens d'un rythme rare, dit à côté du chiffre. Les
    rythmes serrés n'en ont pas besoin : personne ne compte treize venues. */
export const foisDansLAnnee = (semaines: number): number | undefined =>
  (semaines >= 13 ? Math.round(52 / semaines) : undefined);

/* ── LA CADENCE RÉTROACTIVE ─────────────────────────────────────────
   La plupart des têtes reviennent au même rythme : on décrit la cadence, le
   Trône déroule les dates. C'est le chemin le plus court pour une année. */

const plusDeJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
};

/** LES DATES D'UNE CADENCE, du départ jusqu'à la borne incluse.

    LE PLAFOND EXISTE POUR QUE LA BOUCLE FINISSE : une borne mal tapée
    (« 3125 » au lieu de « 2025 ») ne doit pas fabriquer mille rituels. */
export function datesDeLaCadence(o: {
  departIso: string;
  semaines: number;
  jusquIso: string;
  plafond?: number;
}): string[] {
  const pas = Math.max(1, Math.round(o.semaines)) * 7;
  const max = o.plafond ?? 60;
  const suite: string[] = [];
  let iso = o.departIso;
  while (iso <= o.jusquIso && suite.length < max) {
    suite.push(iso);
    iso = plusDeJours(iso, pas);
  }
  return suite;
}

/* ── L'APERÇU ───────────────────────────────────────────────────────
   Rien ne s'écrit avant qu'on ait vu. Et ce qu'on voit doit dire ce qui EXISTE
   DÉJÀ : relancer une saisie par prudence ne doit pas doubler une année. */

export type LigneAPoser = {
  iso: string;
  heure: string;
  clientId: string;
  /** Vrai quand un rituel de cette tête existe déjà ce jour-là. */
  dejaAuCarnet: boolean;
};

/** LE GARDE DU DOUBLON. Une tête, un jour : deux rituels le même jour existent
    (une reprise le matin, un soin le soir), mais lors d'une REPRISE D'ANNÉE ils
    sont mille fois plus souvent une saisie relancée qu'une vraie double venue.
    On décoche donc, on n'interdit pas — la Maison garde le dernier mot. */
export function apercuDeLaSerie(o: {
  dates: readonly { iso: string; heure?: string }[];
  clientId: string;
  heureParDefaut: string;
  dejaPoses: readonly { clientId: string; date: string; status?: string }[];
}): LigneAPoser[] {
  const pris = new Set(
    o.dejaPoses
      .filter((a) => a.clientId === o.clientId && a.status !== 'annulé')
      .map((a) => a.date),
  );
  const vues = new Set<string>();
  const suite: LigneAPoser[] = [];
  for (const d of o.dates) {
    /* LE MÊME JOUR DEUX FOIS DANS LE MÊME COLLAGE : la seconde est une faute de
       frappe, pas une venue. On la garde, marquée, plutôt que de la manger en
       silence. */
    const deja = pris.has(d.iso) || vues.has(d.iso);
    vues.add(d.iso);
    suite.push({ iso: d.iso, heure: d.heure ?? o.heureParDefaut, clientId: o.clientId, dejaAuCarnet: deja });
  }
  return suite.sort((a, b) => a.iso.localeCompare(b.iso) || a.heure.localeCompare(b.heure));
}

/** LA CAISSE D'UNE REPRISE D'ANNÉE — arbitrage du 5 septembre 2026.

    « Verser une année dans la Caisse Principale ferait un solde qui ne
    correspond à aucun billet compté » : l'argent de 2025 est entré, mais il
    n'est plus dans le tiroir. Il lui faut sa propre caisse, hors du comptant
    du jour. */
export const caisseDeLaReprise = (annee: number): string => `Reprise ${annee}`;

/** La marque que porte tout ce qu'une série pose — elle rend le retrait
    possible. Une saisie en masse sans marche arrière est un pari. */
export const marqueDeLaSerie = (id: string): string => `serie:${id}`;

/* ── LA MARCHE ARRIÈRE ──────────────────────────────────────────────
   Poser trente rituels d'un geste et devoir les retirer un par un serait pire
   que de ne rien avoir posé : on renoncerait à la reprise plutôt que de risquer
   une erreur. La marque écrite sur chaque règlement se relit ici.

   MAIS ON NE RETIRE JAMAIS CE QUI A VÉCU DEPUIS. Un rituel facturé, ou sur
   lequel un autre règlement s'est ajouté, n'appartient plus à la série : il
   appartient à la Maison. On le garde, et on dit pourquoi — un retrait
   silencieux qui emporterait une facture serait un trou dans le registre que
   personne ne verrait passer. */

export type RituelDeSerie = {
  id: string;
  clientName?: string;
  date: string;
  creeLe?: string;
  invoiceId?: string;
  payments?: readonly { note?: string; amountXof?: number; cashbox?: string }[];
};

export type SeriePosee = {
  marque: string;
  caisse?: string;
  annee: number;
  /** Ce qui se retire d'un geste. */
  retirables: string[];
  /** Ce qui reste, et la raison — jamais un silence. */
  retenus: { id: string; quoi: string; pourquoi: string }[];
  rituels: number;
  totalXof: number;
  duIso: string;
  auIso: string;
  tetes: string[];
  poseeLe?: string;
};

const marqueDe = (a: RituelDeSerie): string | undefined =>
  (a.payments ?? []).map((p) => p.note).find((n): n is string => !!n && n.startsWith('serie:'));

/** LES SÉRIES POSÉES, la plus récente d'abord. */
export function seriesPosees(appts: readonly RituelDeSerie[]): SeriePosee[] {
  const par = new Map<string, SeriePosee>();
  for (const a of appts) {
    const marque = marqueDe(a);
    if (!marque) continue;
    const siens = (a.payments ?? []).filter((p) => p.note === marque);
    let s = par.get(marque);
    if (!s) {
      s = {
        marque, caisse: siens[0]?.cashbox, annee: 0,
        retirables: [], retenus: [], rituels: 0, totalXof: 0,
        duIso: a.date, auIso: a.date, tetes: [], poseeLe: a.creeLe,
      };
      par.set(marque, s);
    }
    s.rituels += 1;
    s.totalXof += siens.reduce((n, p) => n + Math.max(0, Math.round(p.amountXof ?? 0)), 0);
    if (a.date < s.duIso) s.duIso = a.date;
    if (a.date > s.auIso) s.auIso = a.date;
    if (a.clientName && !s.tetes.includes(a.clientName)) s.tetes.push(a.clientName);
    if (a.creeLe && (!s.poseeLe || a.creeLe < s.poseeLe)) s.poseeLe = a.creeLe;
    /* UNE FACTURE ÉMISE N'EST PLUS UNE LIGNE DE SÉRIE : la retirer laisserait
       une pièce numérotée qui ne désigne plus rien. */
    if (a.invoiceId) {
      s.retenus.push({ id: a.id, quoi: a.date, pourquoi: 'une facture a été émise' });
    } else if ((a.payments ?? []).some((p) => p.note !== marque)) {
      /* UN AUTRE RÈGLEMENT S'Y EST AJOUTÉ : quelqu'un a repris ce rituel à la
         main depuis. Ce n'est plus ce qu'on avait posé. */
      s.retenus.push({ id: a.id, quoi: a.date, pourquoi: 'un autre règlement s’y est ajouté' });
    } else {
      s.retirables.push(a.id);
    }
  }
  for (const s of par.values()) {
    const m = /(\d{4})/.exec(s.caisse ?? '');
    s.annee = m ? Number(m[1]) : Number(s.duIso.slice(0, 4));
    s.retirables.sort();
    s.tetes.sort((a, b) => a.localeCompare(b, 'fr'));
  }
  return [...par.values()].sort((a, b) => (b.poseeLe ?? b.auIso).localeCompare(a.poseeLe ?? a.auIso));
}
