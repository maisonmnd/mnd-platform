/* ══ LE PARCOURS DU FOYER — 4 novembre 2026 ══════════════════════════════
   « F. and J. always come together, they are sisters. Must find a way to
   keep their appointment under one canal. Everything the same. » (Yéman,
   4 novembre 2026 ; les prénoms réduits aux initiales, J. K. et F. K.).
   Maquette `public/maquette-le-parcours-du-foyer.html`, validée le jour même
   (« construis »), ses cinq arbitrages tranchés en bas de page.

   CE QUI EXISTAIT. Le rendez-vous du foyer (2 septembre 2026, RdvFoyer.tsx)
   posait deux têtes liées par `foyerId`, puis chacune se déplaçait,
   s'annulait et se confirmait seule (« une fille malade ne fait pas tomber
   le rendez-vous de sa mère »). Le matin du 4 novembre 2026, il a fallu sept
   gestes pour reposer les deux sœurs au 22 décembre 2026 : la date, l'heure,
   le fauteuil et les gestes de la petite, retapés pour la seconde.

   CE QUE CE FICHIER DIT, sans magasin ni réseau :
   1. qui est du même foyer, et à quel numéro écrire au foyer (pour le
      chantier des messages : un seul message par foyer) ;
   2. déplacer le foyer d'un geste, « seulement elle » restant possible
      (pour le Trône, le calendrier et Opale) ;
   3. la question d'annulation, « les deux, ou seulement <prénom> ? » ;
   4. la version de son âge d'une prestation (MND Kids jusqu'à 15 ans) ;
   5. ce que la case « Elles viennent toujours ensemble » ajoute à une pose,
      et la détection « à lier » de deux rendez-vous posés à part.

   LE FOYER RESTE DES RENDEZ-VOUS, JAMAIS UN RENDEZ-VOUS À DEUX TÊTES. Le
   calendrier, les mains, les commissions et l'âge comptent par tête (la
   règle du 2 septembre 2026 ne bouge pas) : le foyer les tient ensemble,
   il ne les fond pas.

   AUCUN IMPORT, et c'est voulu : une fonction Edge (Opale, les messages)
   peut le recopier tel quel, comme `telDuRdv` ou `appelDe`. Éprouvé par
   `scripts/verifie-le-parcours-du-foyer.mjs` (et `--prouve`). */

/** Le verdict de l'âge, au sens du tarif (`estKids`, shared/accounts). */
export type VerdictDeLAge = 'oui' | 'non' | 'inconnu';

/** Ce que les règles lisent d'un rendez-vous. */
export type RdvDuFoyer = {
  id: string;
  clientId: string;
  date: string;
  time: string;
  status: string;
  branchId?: string;
  master?: string;
  foyerId?: string;
  numeroAPrevenir?: string;
  clientName?: string;
};

/** Ce qu'elles lisent d'une fiche. */
export type TeteDuCompte = { id: string; name?: string; familyId?: string; archived?: boolean; phone?: string };

/** Ce qu'elles lisent du compte famille. */
export type CompteDuFoyer = { id: string; payerClientId?: string; toujoursEnsemble?: boolean };

const minutesDe = (t: string): number => {
  const [h, m] = String(t ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const enHeure = (m: number): string => {
  const n = Math.max(0, Math.min(23 * 60 + 59, Math.round(m)));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const chiffres = (s?: string): string => (s ?? '').replace(/\D/g, '');

/** Un rendez-vous annulé ne fait plus partie du foyer : il ne se déplace, ne
    se confirme ni ne se rappelle. */
const vit = (a: { status: string }): boolean => a.status !== 'annulé';
/** Un rendez-vous honoré a eu lieu : il ne se déplace ni ne s'annule plus. */
const bouge = (a: { status: string }): boolean => a.status !== 'annulé' && a.status !== 'honoré';

const parHeure = <T extends RdvDuFoyer>(a: T, b: T): number =>
  (a.time ?? '').localeCompare(b.time ?? '') || a.clientId.localeCompare(b.clientId);

/* ══ 1. QUI EST DU FOYER ═══════════════════════════════════════════════ */

const CIVILITES = /^(m\.?|mr\.?|mme\.?|mlle\.?|madame|mademoiselle|monsieur|dr\.?)$/i;

/** LE PRÉNOM SEUL, le premier mot du nom : jamais le nom de famille, et
    jamais une civilité (la Maison ne la suppose pas ; une civilité écrite
    en tête du nom se saute). Sans nom : une chaîne vide. */
export const prenomDe = (nom?: string | null): string => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  while (mots.length > 1 && CIVILITES.test(mots[0])) mots.shift();
  return mots[0] ?? '';
};

/** « A. et B. », « A., B. et C. » : les prénoms du foyer, dits ensemble. */
export const prenomsDits = (prenoms: readonly string[]): string => {
  const p = prenoms.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}` : (p[0] ?? '');
};

/** LES TÊTES D'UN COMPTE FAMILLE, quel que soit leur âge, celle par qui l'on
    arrive en tête (2 septembre 2026, sorti de RdvFoyer.tsx le 4 novembre
    2026). `tetesPortees` ne rend que les mineures, ce qui est juste pour Ma
    Couronne et faux au comptoir, où la Maison a les deux sœurs devant elle. */
export function tetesDuFoyer<C extends TeteDuCompte>(client: C, clients: readonly C[], familyId?: string): C[] {
  const fid = familyId ?? client.familyId;
  if (!fid) return [];
  return clients
    .filter((c) => c.familyId === fid && !c.archived)
    .sort((a, b) => (a.id === client.id ? -1 : b.id === client.id ? 1 : (a.name ?? '').localeCompare(b.name ?? '', 'fr')));
}

/** LES RENDEZ-VOUS DU FOYER DE CE RENDEZ-VOUS, lui compris, dans l'ordre de
    l'heure : le même `foyerId`, le même jour, la même branche, non annulés.
    Sans `foyerId`, il est seul. LE JOUR EN PLUS DU `foyerId` : un foyer est
    une venue ; une tête déplacée seule un autre jour avant cette règle ne
    doit pas suivre sa sœur au déplacement suivant. */
export function rdvsDuFoyer<T extends RdvDuFoyer>(rdv: T, rdvs: readonly T[]): T[] {
  if (!rdv.foyerId) return [rdv];
  const ceux = rdvs.filter((a) => a.id !== rdv.id && a.foyerId === rdv.foyerId && a.date === rdv.date
    && (a.branchId ?? '') === (rdv.branchId ?? '') && vit(a));
  return [rdv, ...ceux].sort(parHeure);
}

/** Les autres rendez-vous de son foyer, sans lui. */
export const autresDuFoyer = <T extends RdvDuFoyer>(rdv: T, rdvs: readonly T[]): T[] =>
  rdvsDuFoyer(rdv, rdvs).filter((a) => a.id !== rdv.id);

/** Deux rendez-vous du même foyer, ce jour-là. */
export const memeFoyerQue = <T extends RdvDuFoyer>(a: T, b: T, rdvs: readonly T[]): boolean =>
  a.id === b.id || rdvsDuFoyer(a, rdvs).some((x) => x.id === b.id);

export type LeFoyer<T extends RdvDuFoyer> = {
  /** Le `foyerId`, ou null hors foyer. */
  foyerId: string | null;
  /** Deux rendez-vous vivants au moins. */
  estUnFoyer: boolean;
  /** Ses rendez-vous, dans l'ordre de l'heure. */
  rdvs: T[];
  /** Une ligne par tête : son prénom seul, et son rendez-vous. */
  tetes: { clientId: string; apptId: string; prenom: string }[];
  /** « A. et B. » : le prénom du message devient celui du foyer. */
  prenoms: string;
  /** LE NUMÉRO DU FOYER : celui qui revient le plus parmi ses rendez-vous ;
      à égalité, celui de la première tête de l'heure. Vide sans numéro. */
  numero: string;
  /** Les numéros distincts, dans l'ordre où ils viennent. */
  numeros: string[];
  /** Toutes au même numéro (le cas des deux sœurs au numéro du parent). */
  memeNumero: boolean;
};

/** LE FOYER D'UN RENDEZ-VOUS, POUR LES MESSAGES — un seul message par foyer
    (arbitrage 3 du 4 novembre 2026, construit par un autre chantier) : qui
    vient, et à quel numéro.

    Le numéro de chaque tête suit la règle de `telDuRdv`
    (shared/numero-a-prevenir-pur.ts, recopiée ici pour rester sans import) :
    le numéro à prévenir du rendez-vous, sinon le premier de la fiche. */
export function foyerDuRdv<T extends RdvDuFoyer>(rdv: T, rdvs: readonly T[], fiches: readonly TeteDuCompte[]): LeFoyer<T> {
  const ceux = rdvsDuFoyer(rdv, rdvs);
  const parId = new Map(fiches.map((f) => [f.id, f]));
  const tetes = ceux.map((a) => ({
    clientId: a.clientId, apptId: a.id, prenom: prenomDe(parId.get(a.clientId)?.name ?? a.clientName),
  }));
  const comptes = new Map<string, { numero: string; n: number; rang: number }>();
  ceux.forEach((a, rang) => {
    const n = (a.numeroAPrevenir ?? '').trim() || (parId.get(a.clientId)?.phone ?? '').trim();
    const k = chiffres(n);
    if (!k) return;
    const deja = comptes.get(k);
    if (deja) deja.n += 1; else comptes.set(k, { numero: n, n: 1, rang });
  });
  const distincts = [...comptes.values()].sort((x, y) => x.rang - y.rang);
  const retenu = [...distincts].sort((x, y) => y.n - x.n || x.rang - y.rang)[0];
  return {
    foyerId: rdv.foyerId ?? null,
    estUnFoyer: ceux.filter(vit).length >= 2,
    rdvs: ceux,
    tetes,
    prenoms: prenomsDits(tetes.map((t) => t.prenom)),
    numero: retenu?.numero ?? '',
    numeros: distincts.map((d) => d.numero),
    memeNumero: distincts.length <= 1,
  };
}

/* ══ 2. DÉPLACER LE FOYER ══════════════════════════════════════════════
   Arbitrage 1 : un geste déplace le foyer entier ; « seulement elle » reste
   possible (une malade, un examen). */

/** Une écriture : ce rendez-vous va à ce jour, à cette heure. `detache` :
    il quitte son foyer (« seulement elle »), pour qu'un déplacement suivant
    de sa sœur ne l'emporte pas. Le maître ne bouge jamais ici : chaque tête
    garde son fauteuil et son maître. */
export type Deplacement = { id: string; date: string; time: string; detache?: true };

/** LE FOYER SE DÉPLACE ENSEMBLE. Elle va au jour et à l'heure dits ; les
    autres têtes vivantes de son foyer vont au même jour, et gardent leur
    écart avec elle : venues ensemble à 10 h, elles repartent ensemble à la
    nouvelle heure ; posées « à la suite » chez un seul maître (RdvFoyer), la
    seconde reste à la suite, sans se poser sur le fauteuil de la première.
    Une tête honorée a eu lieu, elle ne bouge pas.

    `seulementElle` : elle seule bouge, et quitte le foyer. Rien ne bouge :
    aucune écriture. */
export function deplacementDuFoyer<T extends RdvDuFoyer>(o: {
  rdv: T;
  rdvs: readonly T[];
  date: string;
  time: string;
  seulementElle?: boolean;
}): Deplacement[] {
  if (o.date === o.rdv.date && o.time === o.rdv.time) return [];
  const elle: Deplacement = { id: o.rdv.id, date: o.date, time: o.time };
  const autres = autresDuFoyer(o.rdv, o.rdvs);
  if (o.seulementElle) return [autres.length > 0 ? { ...elle, detache: true } : elle];
  const ecart = minutesDe(o.time) - minutesDe(o.rdv.time);
  return [elle, ...autres.filter(bouge).map((a) => ({ id: a.id, date: o.date, time: enHeure(minutesDe(a.time) + ecart) }))];
}

/** Les écritures appliquées à une liste de rendez-vous (pure : elle rend
    une nouvelle liste). Ce que le Trône écrit au magasin, et ce qu'Opale
    écrirait en base. */
export function appliqueLeDeplacement<T extends RdvDuFoyer>(rdvs: readonly T[], d: readonly Deplacement[]): T[] {
  const parId = new Map(d.map((x) => [x.id, x]));
  return rdvs.map((a) => {
    const x = parId.get(a.id);
    if (!x) return a;
    if (!x.detache) return { ...a, date: x.date, time: x.time };
    const { foyerId: _sans, ...seule } = a;
    return { ...seule, date: x.date, time: x.time } as T;
  });
}

/* ══ 3. ANNULER ════════════════════════════════════════════════════════
   Arbitrage 2 : le Trône demande « les deux, ou seulement <prénom> ? »
   (une annulation se trompe moins qu'un déplacement, mais elle se demande). */

const EN_LETTRES: Record<number, string> = { 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six' };

export type QuestionDAnnulation = {
  /** « Annuler les deux, ou seulement A. ? » */
  titre: string;
  /** Le bouton du foyer entier : « Les deux ». */
  tous: string;
  /** Le bouton d'elle seule : « Seulement A. ». */
  elle: string;
  /** Les rendez-vous qu'annule chaque réponse. */
  idsTous: string[];
  idsElle: string[];
};

/** LA QUESTION, ou null quand il n'y a rien à demander (hors foyer, ou les
    autres têtes déjà honorées ou annulées). Le prénom seul de la tête de CE
    rendez-vous, jamais son nom de famille, sans civilité supposée. */
export function questionDAnnulation<T extends RdvDuFoyer>(
  rdv: T, rdvs: readonly T[], fiches: readonly TeteDuCompte[],
): QuestionDAnnulation | null {
  const autres = autresDuFoyer(rdv, rdvs).filter(bouge);
  if (autres.length === 0) return null;
  const n = autres.length + 1;
  const prenom = prenomDe(fiches.find((f) => f.id === rdv.clientId)?.name ?? rdv.clientName) || 'elle';
  const combien = EN_LETTRES[n];
  return {
    titre: `Annuler ${combien ? `les ${combien}` : 'tout le foyer'}, ou seulement ${prenom} ?`,
    tous: combien ? `Les ${combien}` : 'Tout le foyer',
    elle: `Seulement ${prenom}`,
    idsTous: [rdv.id, ...autres.map((a) => a.id)],
    idsElle: [rdv.id],
  };
}

/* ══ 4. LA VERSION DE SON ÂGE ══════════════════════════════════════════
   Arbitrage 4 : les mêmes gestes pour les deux, chacune au tarif de son âge
   (la carte MND Kids jusqu'à 15 ans, `AGE_MND_KIDS`), qu'on peut changer
   pour l'une. Le cas réel : J. K. a KLƆKLƆ™ Essentiel + SÍNSIN™ Essentiel ;
   F. K., 9 ans, a KLƆKLƆ™ Kids + SÍNSIN™ Kids.

   LE CATALOGUE NE PORTAIT AUCUNE ÉQUIVALENCE. La section MND Kids
   (shared/kids.ts) est une catégorie à part (`cat-mnd-kids`), ses gestes
   n'ont pas de lien vers ceux des grandes, et leurs noms changent au gré de
   la grille (« KLƆKLƆ™ Kids · Le Shampoing "Le Souffle" » devenu « … · Le
   Souffle »). Deviner par le nom se serait trompé au premier renommage :
   la table est écrite à la main, par identifiants, et le banc la tient.

   LE SENS INVERSE prend la version d'entrée des grandes (l'Essentiel) :
   l'aînée qui vient avec la petite reçoit le geste de base, qu'on change
   pour elle d'un toucher. */
export const EQUIVALENCES_KIDS: readonly { famille: string; adultes: readonly string[]; kids: string }[] = [
  /* Le Plateau : les trois lavages et le lavage au produit apporté. */
  { famille: 'KLƆKLƆ™', adultes: ['sv-plt-05-ess-c', 'sv-plt-05-sig-c', 'sv-plt-05-pre-c', 'sv-dds-shp-e'], kids: 'sv-kids-kloklo' },
  /* La reprise : l'Essentielle et la Signature. */
  { famille: 'SÍNSIN™', adultes: ['sv-atl-ii-e', 'sv-atl-ii-l'], kids: 'sv-kids-sinsin' },
  /* Les soins : le renfort seul (rangé aux soins le 10 octobre 2026). */
  { famille: 'GBÌGBÌ™ · le renfort', adultes: ['sv-plt-40-m'], kids: 'sv-kids-gbigbi' },
  /* LA SUBLIMATION N'A PAS DE VERSION KIDS (Yéman, 4 novembre 2026 : « no
     yekpe ») : elle reste telle quelle, et l'écran la signale à revoir. */
];

export type GesteDeSonAge = {
  /** Le geste d'où l'on part (celui de la tête choisie). */
  depuis: string;
  /** Le geste de son âge. */
  id: string;
  change: boolean;
  /** Aucune version de son âge au catalogue : le même geste, à revoir. */
  sansVersion: boolean;
};

const KIDS_PAR_ADULTE = new Map(EQUIVALENCES_KIDS.flatMap((e) => e.adultes.map((a) => [a, e.kids] as const)));
const ADULTE_PAR_KIDS = new Map(EQUIVALENCES_KIDS.map((e) => [e.kids, e.adultes[0]] as const));

/** LA VERSION DE SON ÂGE D'UN GESTE. `estPourEnfants` lit le catalogue
    (`reserveEnfants`) pour un geste Kids que la table ne nomme pas. Un âge
    inconnu ne change rien : on ne devine pas, le même geste reste (c'est la
    garde de `catalogueDeLaTete`, qui n'ouvre ni ne ferme rien sans âge). */
export function versionDeSonAge(
  id: string, kids: VerdictDeLAge, estPourEnfants: (id: string) => boolean = () => false,
): GesteDeSonAge {
  const meme = (sansVersion = false): GesteDeSonAge => ({ depuis: id, id, change: false, sansVersion });
  const estKids = ADULTE_PAR_KIDS.has(id) || estPourEnfants(id);
  if (kids === 'inconnu') return meme();
  if (kids === 'oui') {
    if (estKids) return meme();
    const k = KIDS_PAR_ADULTE.get(id);
    return k ? { depuis: id, id: k, change: true, sansVersion: false } : meme(true);
  }
  if (!estKids) return meme();
  const a = ADULTE_PAR_KIDS.get(id);
  return a ? { depuis: id, id: a, change: true, sansVersion: false } : meme(true);
}

/** LES GESTES DE SON ÂGE, ligne à ligne, sans doublon (deux lavages des
    grandes deviennent un seul KLƆKLƆ™ Kids : un rituel ne porte jamais deux
    fois le même identifiant, les remises et les mains s'y adressent par
    position). */
export function gestesDeSonAge(
  ids: readonly string[], kids: VerdictDeLAge, estPourEnfants?: (id: string) => boolean,
): { serviceIds: string[]; lignes: GesteDeSonAge[]; aRevoir: string[] } {
  const lignes = ids.map((id) => versionDeSonAge(id, kids, estPourEnfants));
  const serviceIds: string[] = [];
  for (const l of lignes) if (!serviceIds.includes(l.id)) serviceIds.push(l.id);
  return { serviceIds, lignes, aRevoir: lignes.filter((l) => l.sansVersion).map((l) => l.id) };
}

/* ══ 5. QUAND LE FOYER SE FORME ════════════════════════════════════════
   Arbitrage 5 : la case « Elles viennent toujours ensemble » sur le compte
   famille ; et le Trône propose « Les lier » dès qu'il voit deux têtes du
   même compte à la même date et à la même heure, sans `foyerId` commun. */

export type CompagneAPoser = {
  clientId: string;
  prenom: string;
  serviceIds: string[];
  lignes: GesteDeSonAge[];
  ageInconnu: boolean;
};
export type CeQueLeFoyerAjoute = {
  /** La case du compte est cochée, et la tête en est. */
  ensemble: boolean;
  /** Les têtes à poser avec elle, à la même heure. */
  aPoser: CompagneAPoser[];
  /** Les têtes qui ont déjà leur rendez-vous ce jour-là : à la même heure,
      il rejoint le foyer ; à une autre heure, il reste à part, et l'écran
      le dit. Jamais un second rendez-vous le même jour. */
  dejaLa: { clientId: string; prenom: string; apptId: string; time: string; memeHeure: boolean }[];
};

/** CE QUE LA CASE AJOUTE À UNE POSE. Sans la case cochée sur SON compte,
    rien : la règle d'aujourd'hui, chacune à part. `exclues` : les têtes
    retirées à la main pour cette fois (« seulement elle »). */
export function compagnesAPoser<C extends TeteDuCompte, T extends RdvDuFoyer>(o: {
  clientId: string;
  fiches: readonly C[];
  famille: CompteDuFoyer | undefined;
  rdvs: readonly T[];
  branchId: string;
  date: string;
  time: string;
  serviceIds: readonly string[];
  verdictDe: (fiche: C) => VerdictDeLAge;
  estPourEnfants?: (id: string) => boolean;
  exclues?: ReadonlySet<string>;
}): CeQueLeFoyerAjoute {
  const rien: CeQueLeFoyerAjoute = { ensemble: false, aPoser: [], dejaLa: [] };
  const elle = o.fiches.find((c) => c.id === o.clientId);
  if (!elle || !o.famille?.toujoursEnsemble || elle.familyId !== o.famille.id) return rien;
  const out: CeQueLeFoyerAjoute = { ensemble: true, aPoser: [], dejaLa: [] };
  for (const t of tetesDuFoyer(elle, o.fiches)) {
    if (t.id === o.clientId || o.exclues?.has(t.id)) continue;
    const prenom = prenomDe(t.name);
    const sien = o.rdvs.find((a) => a.clientId === t.id && a.date === o.date && vit(a)
      && (a.branchId ?? '') === (o.branchId ?? ''));
    if (sien) {
      out.dejaLa.push({ clientId: t.id, prenom, apptId: sien.id, time: sien.time, memeHeure: sien.time === o.time });
      continue;
    }
    const v = o.verdictDe(t);
    const g = gestesDeSonAge(o.serviceIds, v, o.estPourEnfants);
    out.aPoser.push({ clientId: t.id, prenom, serviceIds: g.serviceIds, lignes: g.lignes, ageInconnu: v === 'inconnu' });
  }
  return out;
}

/** LE MAÎTRE DE CHACUNE, à la même heure, sur l'autre fauteuil. `permis` :
    les maîtres qu'un rituel peut recevoir (un SÍNSIN va chez Team,
    `maitresPermis`) ; `libres` : ceux qui ne reçoivent personne à cette
    heure (`maitresLibres`).

    Un seul maître permis : c'est lui (Team est un calendrier commun qui
    tient plusieurs fauteuils, comme les deux sœurs du 22 décembre 2026).
    Sinon un maître libre qui n'est pas déjà pris par une tête du foyer ;
    sinon le maître de la tête, et les fauteuils se comptent à la pose. Le
    comptoir passe outre la règle d'une place en ligne : les deux fauteuils
    sont à lui. */
export function maitresDesCompagnes(o: {
  maitreDeLaTete: string;
  compagnes: readonly { clientId: string; permis: readonly string[] }[];
  libres: readonly string[];
}): Record<string, string> {
  const pris = new Set([o.maitreDeLaTete]);
  const out: Record<string, string> = {};
  for (const c of o.compagnes) {
    let m: string;
    if (c.permis.length === 1) m = c.permis[0];
    else {
      const libre = o.libres.find((x) => c.permis.includes(x) && !pris.has(x));
      m = libre ?? (c.permis.includes(o.maitreDeLaTete) || c.permis.length === 0 ? o.maitreDeLaTete : c.permis[0]);
    }
    pris.add(m);
    out[c.clientId] = m;
  }
  return out;
}

/** « ELLES VIENNENT ENSEMBLE ? LES LIER » — les rendez-vous posés à part
    qu'il faudrait lier à celui-ci : une autre tête du MÊME compte famille, le
    même jour, à la MÊME heure, dans la même branche, non annulée, et pas
    déjà de son foyer. Même compte et même heure, les deux : deux sœurs à
    10 h et 14 h viennent deux fois, pas ensemble. */
export function aLierAvec<T extends RdvDuFoyer>(rdv: T, rdvs: readonly T[], fiches: readonly TeteDuCompte[]): T[] {
  if (!vit(rdv)) return [];
  const parId = new Map(fiches.map((f) => [f.id, f]));
  const fam = parId.get(rdv.clientId)?.familyId;
  if (!fam) return [];
  return rdvs.filter((a) => {
    if (a.id === rdv.id || a.clientId === rdv.clientId || !vit(a)) return false;
    if (a.date !== rdv.date || a.time !== rdv.time || (a.branchId ?? '') !== (rdv.branchId ?? '')) return false;
    const f = parId.get(a.clientId);
    if (!f || f.archived || f.familyId !== fam) return false;
    return !(rdv.foyerId && a.foyerId === rdv.foyerId);
  });
}

/** LE `foyerId` QUI LES LIE : celui que l'une porte déjà (on rejoint un
    foyer, on n'en refait pas un), sinon `neuf` (« fo-… », comme RdvFoyer).
    Pure : l'appelant tire l'identifiant neuf. */
export function lienDesRdvs<T extends RdvDuFoyer>(rdvs: readonly T[], neuf: string): { foyerId: string; ids: string[] } {
  const existant = rdvs.map((a) => a.foyerId).find((f): f is string => !!f);
  return { foyerId: existant ?? neuf, ids: rdvs.map((a) => a.id) };
}
