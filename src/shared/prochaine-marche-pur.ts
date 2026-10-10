/* ══ VOTRE PROCHAINE MARCHE — Ma Couronne, 1er janvier 2027 ══════════════
   La genèse des prix (synthèse 2.4, maquette validée le 10 octobre 2026) :
   « Dans Ma Couronne, une seule carte : Votre prochaine marche, calculée sur
   le palier, la date de couronne, la dernière visite et la formule. »

   UNE SEULE CARTE, LA PREMIÈRE QUI S'APPLIQUE, dans l'ordre du tableau des
   déclencheurs, ramené aux sept formules en lunes :
   ① une création honorée il y a 30 jours au plus → VÈKPÈ™ · Les Premières
     Lunes (« à signer à la caisse de la création ou dans les 30 jours ») ;
   ② une Couleur honorée il y a 14 jours au plus → YÈKPÈ™ · Cure de Lumière ;
   ③ une formule en cours à deux venues de sa fin → la formule du rythme
     au-dessus (Premières Lunes ou Carnet de Quatre → Carnet de Six → Carnet
     de l'Année) ; une formule en cours qui a encore du chemin : rien ;
   ④ le premier anniversaire de couronne (de 7 jours avant à 30 jours après)
     → le Carnet de l'Année ;
   ⑤ une couronne née ailleurs (aucune création à la Maison, mais un KÒKÒ™
     Accueil ou une visite d'entretien) → le Carnet de Quatre, la porte, une
     fois par tête ;
   ⑥ trois visites honorées dans l'année → le Carnet de Six ;
   ⑦ un KÒKÒ™ Origine honoré il y a 30 jours au plus, sans création → votre
     création (le Regard s'en déduit).
   Une formule déjà prise une fois par tête ne se repropose pas ; une tête qui
   vient en Signature se voit proposer la variante Signature.

   Pur : aucun magasin, aucun réseau, aucun import. */

export const PREMIERES_LUNES = 'pl-lune-premieres';
export const CARNET_DE_QUATRE = 'pl-lune-quatre';
export const CARNET_DE_SIX = 'pl-lune-six';
export const CARNET_DE_L_ANNEE = 'pl-lune-annee';
export const CURE_DE_LUMIERE = 'sv-yekpe-cure-lumiere';
export const REGARD_ORIGINE = 'sv-koko-ori';
export const REGARD_ACCUEIL = 'sv-koko-sui';
/** Les Regards : une visite qui n'est QUE cela ne dit pas une couronne. */
export const REGARDS: readonly string[] = [REGARD_ORIGINE, REGARD_ACCUEIL, 'svc-doto-conseil', 'sv-koko-bilan'];
/** Les deux Couleurs (la seconde archivée en janvier, ses visites passées comptent). */
export const COULEURS: readonly string[] = ['sv-atl-iii-cou-c', 'sv-atl-iii-cou-l'];
/** Ce qui fait d'une visite une visite Signature. */
export const SIGNATURE: readonly string[] = ['sv-atl-ii-l', 'sv-venue-gbeji-sig'];

export type Marche =
  | { cle: 'premieres-lunes' | 'rythme-au-dessus' | 'carnet-annee' | 'carnet-quatre' | 'carnet-six'; planId: string }
  | { cle: 'cure-lumiere'; serviceId: string }
  | { cle: 'creation' };

type Visite = { date: string; status: string; serviceIds: readonly string[]; seriesIndex?: number };

const jours = (de: string, a: string): number =>
  Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** Le rythme au-dessus d'une formule en lunes (la variante Signature suit). */
const AU_DESSUS: Readonly<Record<string, string>> = {
  'pl-lune-premieres': CARNET_DE_SIX, 'pl-lune-quatre': CARNET_DE_SIX, 'pl-lune-quatre-sig': `${CARNET_DE_SIX}-sig`,
  'pl-lune-six': CARNET_DE_L_ANNEE, 'pl-lune-six-sig': `${CARNET_DE_L_ANNEE}-sig`,
  'pl-lune-annee': CARNET_DE_L_ANNEE, 'pl-lune-annee-sig': `${CARNET_DE_L_ANNEE}-sig`,
};

/** SA PROCHAINE MARCHE, ou `null` : rien à proposer, la carte se tait. */
export function prochaineMarche(o: {
  jour: string;
  visites: readonly Visite[];
  estCreation: (serviceId: string) => boolean;
  crownSince?: string;
  /** Sa formule en cours et ses venues restantes, s'il y en a une. */
  formule?: { planId: string; restantes?: number };
  /** Les formules qu'elle a déjà prises une fois (tout contrat, même fini). */
  dejaPrises: ReadonlySet<string>;
  /** Les formules en vente pour elle (ouvertes et visibles). */
  enVente: ReadonlySet<string>;
  /** Un rendez-vous à venir porte-t-il déjà une création ? */
  creationAVenir?: boolean;
}): Marche | null {
  const honorees = o.visites
    .filter((v) => v.status === 'honoré' && (v.seriesIndex ?? 1) <= 1 && v.date.slice(0, 10) <= o.jour)
    .sort((a, b) => b.date.localeCompare(a.date));
  const derniere = honorees[0];
  const signature = !!derniere && derniere.serviceIds.some((id) => SIGNATURE.includes(id));
  const propose = (base: string): string | null => {
    const variante = signature && base !== PREMIERES_LUNES ? `${base}-sig` : base;
    for (const id of [variante, base]) if (o.enVente.has(id) && !o.dejaPrises.has(id)) return id;
    return null;
  };
  const depuis = (filtre: (v: Visite) => boolean, n: number) =>
    honorees.some((v) => filtre(v) && jours(v.date, o.jour) >= 0 && jours(v.date, o.jour) <= n);
  const creee = honorees.some((v) => v.serviceIds.some(o.estCreation));
  const neeAilleurs = !creee && honorees.some((v) => v.serviceIds.includes(REGARD_ACCUEIL)
    || v.serviceIds.some((id) => !REGARDS.includes(id)));

  if (!o.formule && depuis((v) => v.serviceIds.some(o.estCreation), 30)) {           // ①
    const p = propose(PREMIERES_LUNES);
    if (p) return { cle: 'premieres-lunes', planId: p };
  }
  if (depuis((v) => v.serviceIds.some((id) => COULEURS.includes(id)), 14)
    && !honorees.some((v) => v.serviceIds.includes(CURE_DE_LUMIERE))) {
    return { cle: 'cure-lumiere', serviceId: CURE_DE_LUMIERE };                       // ②
  }
  if (o.formule) {                                                                    // ③
    if (typeof o.formule.restantes !== 'number' || o.formule.restantes > 2) return null;
    const suivante = AU_DESSUS[o.formule.planId];
    if (!suivante || !o.enVente.has(suivante)) return null;
    return { cle: 'rythme-au-dessus', planId: suivante };
  }
  if (o.crownSince) {                                                                 // ④
    const an = `${Number(o.crownSince.slice(0, 4)) + 1}${o.crownSince.slice(4, 10)}`;
    const ecart = jours(an, o.jour);
    if (ecart >= -7 && ecart <= 30) { const p = propose(CARNET_DE_L_ANNEE); if (p) return { cle: 'carnet-annee', planId: p }; }
  }
  if (neeAilleurs) {                                                                  // ⑤
    const p = propose(CARNET_DE_QUATRE);
    if (p) return { cle: 'carnet-quatre', planId: p };
  }
  if (honorees.filter((v) => jours(v.date, o.jour) <= 365).length >= 3) {           // ⑥
    const p = propose(CARNET_DE_SIX);
    if (p) return { cle: 'carnet-six', planId: p };
  }
  if (!creee && !o.creationAVenir && depuis((v) => v.serviceIds.includes(REGARD_ORIGINE), 30)) {
    return { cle: 'creation' };                                                        // ⑦
  }
  return null;
}
