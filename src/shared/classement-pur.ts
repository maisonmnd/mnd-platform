/* ══ LE CLASSEMENT DES CLIENTES — 20 novembre 2026 ═══════════════════════
   « Je veux définir ces critères qui permettent à chacun d'appartenir à un
   groupe. On va définir ces critères d'abord et ensuite, on va faire le
   travail de classement » ; « Construis-moi Le classement des clientes dans
   le Trône » ; « rajoute les catégories avec leurs spécifications dans le
   Trône » (Yéman, 20 novembre 2026). Maquette : la page « Le classement des
   clientes » (artifact 7dMsfEcG…), critères réglés sur place.

   QUATRE AXES, UNE CLIENTE :
     · L'ÉTAPE — une seule, où elle en est avec la Maison. Les règles se lisent
       dans l'ordre ; la première qui s'applique l'emporte. Les catégories de
       la Maison de type « étape » passent juste après « Sans catégorie ».
       CINQ CATÉGORIES depuis le 25 novembre 2026 (voir `ETAPES`) : la
       Privilégiée, la Régulière, l'Annulée, la Dormante, la Diaspora. Le
       lieu, le rythme et les marques se calculent toujours (le dossier les
       dit, la Diaspora et le rythme annuel en dépendent), mais ne sont plus
       des catégories de la colonne.
     · LE LIEU — où elle vit : Cotonou, Hors Cotonou (Calavi, Porto-Novo,
       Bohicon, autre ville), Bénin à préciser, la diaspora (France, Canada,
       États-Unis, Afrique, Europe, autre), ou inconnu. Le choix de la Maison,
       puis la ville de la fiche, puis la marque diaspora, puis l'indicatif.
     · LE RYTHME — régulière, espacée, annuelle (une ou deux fois par an : ce
       n'est pas une dormante, c'est sa cadence), ou pas encore connu.
     · LES MARQUES — plusieurs : annule souvent, abonnée sans prochaine
       séance, rendez-vous restés « confirmés », ancienne abonnée, diaspora à
       confirmer, sans numéro, de passage ; et celles de la Maison.

   UN CHOIX POSÉ BAT UNE DÉDUCTION (la règle de `personaFige`, `passagePose`) :
   l'étape, le lieu et le rythme choisis dans le dossier passent avant les
   critères. Les critères eux-mêmes se règlent au Trône (`mnd_classement`).

   PUR : ni magasin, ni réseau, ni horloge (le jour entre par la porte). */

/* ── Les critères réglables ─────────────────────────────────────────── */
export type CriteresDuClassement = {
  hors_stop: boolean; hors_locks: boolean; hors_passage_pose: boolean;
  annulee_jours: number; annulee_absences: boolean;
  curieuse_jours: number; premiere_jours: number; de_passage: 'disparue' | 'hors';
  rythme_maison: number; marge: number; dormante_jours: number;
  annuelle_rythme: number; annuelle_marge: number; reguliere_max: number;
  diaspora_remplace: boolean; numero_suffit: boolean; ville_inconnue: 'a-preciser' | 'cotonou';
  annule_nb: number; annule_mois: number; annule_absences: boolean;
};

/** Les critères proposés le 20 novembre 2026 ; la Maison les règle au Trône. */
export const CRITERES_PROPOSES: CriteresDuClassement = {
  hors_stop: true, hors_locks: true, hors_passage_pose: true,
  annulee_jours: 60, annulee_absences: true,
  curieuse_jours: 180, premiere_jours: 60, de_passage: 'disparue',
  rythme_maison: 49, marge: 10, dormante_jours: 120,
  annuelle_rythme: 150, annuelle_marge: 45, reguliere_max: 60,
  diaspora_remplace: true, numero_suffit: true, ville_inconnue: 'a-preciser',
  annule_nb: 3, annule_mois: 12, annule_absences: true,
};

/** Les critères en vigueur : ceux posés par la Maison, les proposés à défaut,
    et jamais une valeur d'un autre type (un document abîmé ne casse rien). */
export function criteresEnVigueur(poses: Partial<Record<keyof CriteresDuClassement, unknown>> | null | undefined): CriteresDuClassement {
  const p: Record<string, unknown> = { ...CRITERES_PROPOSES };
  for (const k of Object.keys(CRITERES_PROPOSES) as (keyof CriteresDuClassement)[]) {
    const v = poses?.[k];
    const d = CRITERES_PROPOSES[k];
    if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) p[k] = v;
    else if (typeof d === 'boolean' && typeof v === 'boolean') p[k] = v;
    else if (k === 'de_passage' && (v === 'disparue' || v === 'hors')) p[k] = v;
    else if (k === 'ville_inconnue' && (v === 'a-preciser' || v === 'cotonou')) p[k] = v;
  }
  return p as CriteresDuClassement;
}

/* ── Le vocabulaire ─────────────────────────────────────────────────── */
export type Libelle = { cle: string; nom: string };
/* CINQ CATÉGORIES — 25 novembre 2026. « Je veux garder la diaspora, la
   dormante, la régulière, l'annulée, la privilégiée (crée cette catégorie),
   et supprime les autres et refaire le classement » (Yéman). La Curieuse, la
   Réservée, la Première, la Disparue, la Couronne, l'Annuelle, Elle glisse,
   l'Abonnée et le contact ancien sont partis ; leurs clientes se rangent
   dans les cinq. « Sans catégorie » n'est pas une sixième catégorie : c'est
   où restent une fiche sans visite, une fiche d'essai, et celle qui a dit
   STOP (jamais relancée). L'ordre est celui de la colonne ; l'ordre des
   règles se lit dans `classeLaCliente`. */
export const ETAPES: readonly Libelle[] = [
  { cle: 'privilegiee', nom: 'La Privilégiée' },
  { cle: 'reguliere', nom: 'La Régulière' },
  { cle: 'annulee', nom: 'L’Annulée' },
  { cle: 'dormante', nom: 'La Dormante' },
  { cle: 'diaspora', nom: 'La Diaspora' },
  { cle: 'hors', nom: 'Sans catégorie' },
];
export type GroupeDeLieu = 'cotonou' | 'hors' | 'benin' | 'diaspora' | 'inconnu';
export const LIEUX: readonly (Libelle & { groupe: GroupeDeLieu })[] = [
  { cle: 'cotonou', nom: 'Cotonou', groupe: 'cotonou' },
  { cle: 'calavi', nom: 'Calavi', groupe: 'hors' },
  { cle: 'porto-novo', nom: 'Porto-Novo', groupe: 'hors' },
  { cle: 'bohicon', nom: 'Bohicon', groupe: 'hors' },
  { cle: 'benin-autre', nom: 'Autre ville du Bénin', groupe: 'hors' },
  { cle: 'benin-a-preciser', nom: 'Bénin, ville à préciser', groupe: 'benin' },
  { cle: 'dia-france', nom: 'Diaspora France', groupe: 'diaspora' },
  { cle: 'dia-canada', nom: 'Diaspora Canada', groupe: 'diaspora' },
  { cle: 'dia-usa', nom: 'Diaspora États-Unis', groupe: 'diaspora' },
  { cle: 'dia-afrique', nom: 'Diaspora Afrique', groupe: 'diaspora' },
  { cle: 'dia-europe', nom: 'Diaspora Europe', groupe: 'diaspora' },
  { cle: 'dia-autre', nom: 'Diaspora, autre pays', groupe: 'diaspora' },
  { cle: 'dia-a-preciser', nom: 'Diaspora, pays à préciser', groupe: 'diaspora' },
  { cle: 'inconnu', nom: 'Lieu inconnu', groupe: 'inconnu' },
];
export const GROUPES_DE_LIEU: readonly (Libelle & { cle: GroupeDeLieu })[] = [
  { cle: 'cotonou', nom: 'Cotonou' }, { cle: 'hors', nom: 'Hors Cotonou' }, { cle: 'benin', nom: 'Bénin, ville à préciser' },
  { cle: 'diaspora', nom: 'La diaspora' }, { cle: 'inconnu', nom: 'Lieu inconnu' },
];
export type CleDeRythme = 'reguliere' | 'espacee' | 'annuelle' | 'inconnu';
export const RYTHMES: readonly (Libelle & { cle: CleDeRythme })[] = [
  { cle: 'reguliere', nom: 'Régulière' }, { cle: 'espacee', nom: 'Espacée' }, { cle: 'annuelle', nom: 'Annuelle' }, { cle: 'inconnu', nom: 'Pas encore connu' },
];
export const MARQUES: readonly Libelle[] = [
  { cle: 'abonnee-sans-rdv', nom: 'Abonnée sans prochaine séance' },
  { cle: 'annule-souvent', nom: 'Annule souvent' },
  { cle: 'absences', nom: 'Rendez-vous restés « confirmés »' },
  { cle: 'ancienne-abonnee', nom: 'Ancienne abonnée' },
  { cle: 'diaspora-a-confirmer', nom: 'Diaspora à confirmer' },
  { cle: 'sans-numero', nom: 'Sans numéro' },
  { cle: 'de-passage', nom: 'Marquée « de passage »' },
];
/** Le rythme que la Maison peut choisir dans le dossier : « elle vient une
    fois par an », « deux fois par an ». Ce n'est pas une dormante. */
export const RYTHMES_CHOISIS: Readonly<Record<'une-par-an' | 'deux-par-an', number>> = { 'une-par-an': 365, 'deux-par-an': 182 };

/* ── Les catégories de la Maison ────────────────────────────────────── */
export type ChampDeCritere = 'visites' | 'joursDepuis' | 'rythme' | 'annulations12' | 'absences' | 'rdvAVenir' | 'lieu' | 'rythmeCat' | 'accord' | 'persona' | 'abonnee' | 'dePassage';
export type CritereDeLaMaison = { champ: ChampDeCritere; op: '>=' | '<=' | '=' | '≠'; valeur: string | number };
export type CategorieDeLaMaison = { id: string; nom: string; regle: string; type: 'etape' | 'marque'; criteres: CritereDeLaMaison[]; ordre: number };
export const CHAMPS: Readonly<Record<ChampDeCritere, { nom: string; type: 'num' | 'bool' | 'enum' }>> = {
  visites: { nom: 'Nombre de visites', type: 'num' },
  joursDepuis: { nom: 'Jours depuis la dernière visite', type: 'num' },
  rythme: { nom: 'Son rythme (jours entre deux visites)', type: 'num' },
  annulations12: { nom: 'Annulations sur 12 mois', type: 'num' },
  absences: { nom: 'Rendez-vous restés « confirmés »', type: 'num' },
  rdvAVenir: { nom: 'Un rendez-vous à venir', type: 'bool' },
  lieu: { nom: 'Lieu', type: 'enum' },
  rythmeCat: { nom: 'Rythme', type: 'enum' },
  accord: { nom: 'Accord des nouvelles', type: 'enum' },
  persona: { nom: 'Persona du Trône', type: 'enum' },
  abonnee: { nom: 'Abonnée active', type: 'bool' },
  dePassage: { nom: 'Marquée « de passage »', type: 'bool' },
};
/** Les catégories de la Maison d'un document neuf : aucune. « À définir » et
    « Retour en Afro », posées le 20 novembre 2026, sont parties le 25 avec les
    autres (« supprime les autres », Yéman). */
export const CATEGORIES_DE_DEPART: CategorieDeLaMaison[] = [];

/* ── Le choix posé dans le dossier ──────────────────────────────────── */
export type ChoixDuParcours = { etape?: string; lieu?: string; rythme?: 'une-par-an' | 'deux-par-an' | ''; note?: string; le?: string; par?: string };

/* ── Le numéro et la ville ──────────────────────────────────────────── */
const CANADA = new Set('204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 600 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942'.split(' '));
/** Les pays que l'indicatif nomme, rangés par région. */
const PAYS_DE_L_INDICATIF: Readonly<Record<string, { pays: string; region: Region }>> = {
  '33': { pays: 'France', region: 'France' }, '262': { pays: 'France', region: 'France' }, '590': { pays: 'France', region: 'France' },
  '594': { pays: 'France', region: 'France' }, '596': { pays: 'France', region: 'France' },
  '32': { pays: 'Belgique', region: 'Europe' }, '41': { pays: 'Suisse', region: 'Europe' }, '49': { pays: 'Allemagne', region: 'Europe' },
  '44': { pays: 'Royaume-Uni', region: 'Europe' }, '39': { pays: 'Italie', region: 'Europe' }, '34': { pays: 'Espagne', region: 'Europe' },
  '31': { pays: 'Pays-Bas', region: 'Europe' }, '351': { pays: 'Portugal', region: 'Europe' }, '352': { pays: 'Luxembourg', region: 'Europe' },
  '353': { pays: 'Irlande', region: 'Europe' }, '46': { pays: 'Suède', region: 'Europe' }, '47': { pays: 'Norvège', region: 'Europe' }, '45': { pays: 'Danemark', region: 'Europe' },
  '225': { pays: 'Côte d’Ivoire', region: 'Afrique' }, '228': { pays: 'Togo', region: 'Afrique' }, '234': { pays: 'Nigeria', region: 'Afrique' },
  '233': { pays: 'Ghana', region: 'Afrique' }, '221': { pays: 'Sénégal', region: 'Afrique' }, '237': { pays: 'Cameroun', region: 'Afrique' },
  '243': { pays: 'RD Congo', region: 'Afrique' }, '242': { pays: 'Congo', region: 'Afrique' }, '241': { pays: 'Gabon', region: 'Afrique' },
  '226': { pays: 'Burkina Faso', region: 'Afrique' }, '227': { pays: 'Niger', region: 'Afrique' }, '223': { pays: 'Mali', region: 'Afrique' },
  '224': { pays: 'Guinée', region: 'Afrique' }, '212': { pays: 'Maroc', region: 'Afrique' }, '216': { pays: 'Tunisie', region: 'Afrique' },
  '213': { pays: 'Algérie', region: 'Afrique' }, '27': { pays: 'Afrique du Sud', region: 'Afrique' }, '20': { pays: 'Égypte', region: 'Afrique' },
};
export type Region = 'Bénin' | 'France' | 'Canada' | 'États-Unis' | 'Afrique' | 'Europe' | 'Autre pays' | 'Sans numéro';
/** La région (et le pays, s'il se lit) d'un numéro. Un numéro sans indicatif
    est du Bénin ; le +1 se partage entre le Canada et les États-Unis, que
    l'indicatif régional départage. */
export function regionDuNumero(tel: string | undefined | null): { region: Region; pays: string } {
  const t = String(tel ?? '').trim();
  const d = t.replace(/\D/g, '');
  if (d.length < 8) return { region: 'Sans numéro', pays: '' };
  let intl: string | null = null;
  if (t.startsWith('+')) intl = d; else if (d.startsWith('00')) intl = d.slice(2);
  else if (d.startsWith('229') && d.length >= 11) intl = d;
  if (!intl || intl.startsWith('229')) return { region: 'Bénin', pays: 'Bénin' };
  if (intl.startsWith('1')) return CANADA.has(intl.slice(1, 4)) ? { region: 'Canada', pays: 'Canada' } : { region: 'États-Unis', pays: 'États-Unis' };
  for (const n of [3, 2]) { const x = PAYS_DE_L_INDICATIF[intl.slice(0, n)]; if (x) return x; }
  if (intl.startsWith('2')) return { region: 'Afrique', pays: '' };
  if (intl.startsWith('3') || intl.startsWith('4')) return { region: 'Europe', pays: '' };
  return { region: 'Autre pays', pays: '' };
}

const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const VILLES: readonly [RegExp, string][] = [
  [/\b(cotonou|suru ?lere|fidjrosse|akpakpa|cadjehoun|gbegamey|zogbo|agla|haie vive|fifadji|vedoko|menontin|sainte rita|zone des ambassades|ganhi|jericho|houeyiho|kouhounou|dantokpa|missebo|vodje|gbedjromede|aidjedo|setovi|kindonou|avotrou|ladji|tokpa)\b/, 'cotonou'],
  [/\b(calavi|abomey calavi|godomey|togbin|akassato|ouedo|zinvie|hevie|cocotomey|tankpe|kpanroun|womey|pahou)\b/, 'calavi'],
  [/\b(porto novo|portonovo)\b/, 'porto-novo'],
  [/\bbohicon\b/, 'bohicon'],
  [/\b(ouidah|parakou|abomey|lokossa|natitingou|djougou|seme|seme kpodji|allada|come|grand popo|dassa|savalou|kandi|malanville)\b/, 'benin-autre'],
  [/\b(france|paris|longjumeau|long jumeau|lyon|marseille|lille|bordeaux|toulouse|nantes|strasbourg|nice|montpellier|rennes|creteil|evry|massy|ile de france)\b/, 'dia-france'],
  [/\b(canada|montreal|quebec|ottawa|toronto|gatineau|laval|vancouver|calgary)\b/, 'dia-canada'],
  [/\b(etats unis|usa|new york|washington|houston|atlanta|chicago|los angeles|miami|dallas|boston|philadelphie|maryland|texas)\b/, 'dia-usa'],
  [/\b(togo|lome|nigeria|lagos|abuja|ghana|accra|cote d ivoire|abidjan|senegal|dakar|cameroun|douala|yaounde|gabon|libreville|niger|niamey|burkina|ouagadougou|mali|bamako|congo|kinshasa|brazzaville|guinee|conakry|maroc|casablanca|tunisie|tunis|algerie|afrique du sud|johannesburg|kenya|nairobi|egypte)\b/, 'dia-afrique'],
  [/\b(belgique|bruxelles|liege|suisse|geneve|lausanne|allemagne|berlin|royaume uni|londres|london|italie|rome|espagne|madrid|pays bas|amsterdam|portugal|lisbonne|luxembourg|irlande|suede|norvege|danemark)\b/, 'dia-europe'],
];
/** Le lieu qu'une ville écrite sur la fiche désigne ; `null` si rien d'écrit,
    'non-reconnue' si la ville ne dit pas où la ranger. */
export function lieuDeLaVille(ville: string | undefined | null): string | null {
  const s = sansAccents(String(ville ?? ''));
  if (!s || /atelier/.test(s) || /^benin$/.test(s)) return null;
  for (const [re, lieu] of VILLES) if (re.test(s)) return lieu;
  return 'non-reconnue';
}

/** LES VILLES PROPOSÉES dans la rubrique « Ville » du profil, rangées comme le
    classement les lit. On peut toujours écrire autre chose. */
export const VILLES_PROPOSEES: readonly { groupe: string; villes: readonly string[] }[] = [
  { groupe: 'Cotonou', villes: ['Cotonou', 'Akpakpa', 'Cadjehoun', 'Fidjrossè', 'Gbégamey', 'Haie Vive', 'Suru-Léré', 'Zogbo', 'Agla', 'Fifadji', 'Vèdoko', 'Ménontin'] },
  { groupe: 'Hors Cotonou', villes: ['Abomey-Calavi', 'Godomey', 'Togbin', 'Porto-Novo', 'Bohicon', 'Ouidah', 'Sèmè-Kpodji', 'Allada', 'Abomey', 'Parakou', 'Lokossa', 'Natitingou'] },
  { groupe: 'La diaspora', villes: ['France', 'Paris', 'Lyon', 'Canada', 'Montréal', 'Ottawa', 'États-Unis', 'New York', 'Belgique', 'Bruxelles', 'Suisse', 'Allemagne', 'Royaume-Uni', 'Togo', 'Lomé', 'Nigeria', 'Lagos', 'Côte d’Ivoire', 'Abidjan', 'Ghana', 'Sénégal', 'Gabon', 'Cameroun'] },
];

/** CE QUE LE NUMÉRO DIT DE SA VILLE, quand la fiche n'en porte aucune : le
    pays d'un numéro étranger (« France », « Togo »). Jamais une ville du Bénin
    (le numéro ne la dit pas), jamais deux fois (`villeDeduiteLe`). */
export function villeADeduire(c: { city?: string; phone?: string; villeDeduiteLe?: string }): string | null {
  if (String(c.city ?? '').trim() || c.villeDeduiteLe) return null;
  const { region, pays } = regionDuNumero(c.phone);
  if (region === 'Bénin' || region === 'Sans numéro' || !pays) return null;
  return pays;
}

/* ── Ce que le classement lit d'une cliente ─────────────────────────── */
export type FicheDuClassement = {
  id: string; nom: string;
  visites: number; premiere: string | null; derniere: string | null; prochain: string | null;
  /** L'écart médian entre ses jours de visite (deux visites et plus). */
  rythme: number | null;
  /** Le rythme déclaré sur la fiche (`rythmeSemaines`), en jours. */
  rythmeDeclare: number | null;
  annulations: string[]; absences: string[];
  regionNumero: Region; ville: string; lieuSaisi: string | null;
  /** La ville a été écrite d'après l'indicatif (`villeADeduire`). */
  villeDeduite: boolean;
  marquee: boolean; dePassage: boolean; passagePose: boolean; locksDefaits: boolean;
  persona: string; accord: 'oui' | 'non' | 'stop' | 'inconnu';
  essai: boolean; ficheDepuis: string | null;
  abonnements: { statut: string; formule: string; fin: string | null }[];
  choix: ChoixDuParcours;
};

type ClientLu = {
  id: string; name: string; phone?: string; city?: string; diaspora?: boolean; dePassage?: boolean; passagePose?: boolean; locksDefaits?: boolean;
  persona?: string; nouvelles?: { oui: boolean; par: string }; essai?: boolean; since?: string; rythmeSemaines?: number; parcours?: ChoixDuParcours;
  villeDeduiteLe?: string;
};
type RdvLu = { clientId: string; date: string; status: string; time?: string };
type AbonnementLu = { clientId?: string; status: string; planId: string; expiresIso?: string | null };

const ISO = /^\d{4}-\d{2}-\d{2}/;
const jourDe = (s: string | undefined | null) => (s && ISO.test(s) ? s.slice(0, 10) : null);
export const joursEntre = (a: string, b: string): number => Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** La fiche du classement d'une cliente, lue de sa fiche, de ses rendez-vous
    et de ses abonnements. `aujourdhui` est le jour de Cotonou. */
export function ficheDuClassement(c: ClientLu, rdvs: readonly RdvLu[], abonnements: readonly AbonnementLu[], nomDeLaFormule: (planId: string) => string, aujourdhui: string): FicheDuClassement {
  const siens = rdvs.filter((r) => r.clientId === c.id && jourDe(r.date));
  const jours = Array.from(new Set(siens.filter((r) => r.status === 'honoré').map((r) => r.date.slice(0, 10)))).sort();
  const ecarts = jours.slice(1).map((j, i) => joursEntre(jours[i], j)).filter((x) => x > 0).sort((a, b) => a - b);
  const mediane = ecarts.length === 0 ? null : ecarts.length % 2 ? ecarts[(ecarts.length - 1) / 2] : Math.round((ecarts[ecarts.length / 2 - 1] + ecarts[ecarts.length / 2]) / 2);
  const avenir = siens.filter((r) => (r.status === 'confirmé' || r.status === 'en attente') && r.date.slice(0, 10) >= aujourdhui).map((r) => r.date.slice(0, 10)).sort();
  const lieuSaisi = lieuDeLaVille(c.city);
  return {
    id: c.id, nom: c.name,
    visites: jours.length, premiere: jours[0] ?? null, derniere: jours[jours.length - 1] ?? null, prochain: avenir[0] ?? null,
    rythme: mediane, rythmeDeclare: c.rythmeSemaines && c.rythmeSemaines > 0 ? Math.round(c.rythmeSemaines * 7) : null,
    annulations: siens.filter((r) => r.status === 'annulé').map((r) => r.date.slice(0, 10)).sort(),
    absences: siens.filter((r) => r.status === 'confirmé' && r.date.slice(0, 10) < aujourdhui).map((r) => r.date.slice(0, 10)).sort(),
    regionNumero: regionDuNumero(c.phone).region, ville: String(c.city ?? '').trim(), lieuSaisi, villeDeduite: !!c.villeDeduiteLe,
    marquee:c.diaspora === true, dePassage: c.dePassage === true, passagePose: c.passagePose === true, locksDefaits: c.locksDefaits === true,
    persona: c.persona ?? '',
    accord: !c.nouvelles ? 'inconnu' : c.nouvelles.par === 'stop' ? 'stop' : c.nouvelles.oui ? 'oui' : 'non',
    essai: c.essai === true, ficheDepuis: jourDe(c.since),
    abonnements: abonnements.filter((a) => a.clientId === c.id).map((a) => ({ statut: a.status, formule: nomDeLaFormule(a.planId), fin: jourDe(a.expiresIso ?? null) })),
    choix: c.parcours ?? {},
  };
}

/* ── Le classement ──────────────────────────────────────────────────── */
export type ResultatDuClassement = {
  etape: string; etapeAuto: string; lieu: string; groupe: GroupeDeLieu; rythme: CleDeRythme; rythmeJours: number | null;
  marques: string[]; raisons: { etape: string; lieu: string; rythme: string };
};

const REGION_VERS_LIEU: Readonly<Partial<Record<Region, string>>> = { 'France': 'dia-france', 'Canada': 'dia-canada', 'États-Unis': 'dia-usa', 'Afrique': 'dia-afrique', 'Europe': 'dia-europe', 'Autre pays': 'dia-autre' };
const MOIS_MS = 30.44;
const dansLesMois = (dates: readonly string[], mois: number, t: string) => dates.filter((d) => { const j = joursEntre(d, t); return j >= 0 && j <= mois * MOIS_MS; }).length;
const nomDe = (liste: readonly Libelle[], cle: string) => liste.find((x) => x.cle === cle)?.nom ?? cle;
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const jourDit = (iso: string | null | undefined): string => { if (!iso) return ''; const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return `${j} ${MOIS_FR[m - 1]} ${a}`; };

export function abonnementActif(f: Pick<FicheDuClassement, 'abonnements'>, aujourdhui: string) {
  return f.abonnements.find((a) => (a.statut === 'active' || a.statut === 'new' || a.statut === 'risk') && (!a.fin || a.fin >= aujourdhui)) ?? null;
}

/** Les valeurs qu'une catégorie de la Maison peut demander. */
function valeurs(f: FicheDuClassement, lieu: string, groupe: GroupeDeLieu, rythme: CleDeRythme, rythmeJours: number | null, t: string): Record<ChampDeCritere, string | number | null> & { groupe: string } {
  return {
    visites: f.visites, joursDepuis: f.derniere ? joursEntre(f.derniere, t) : null, rythme: rythmeJours,
    annulations12: dansLesMois(f.annulations, 12, t), absences: f.absences.length, rdvAVenir: f.prochain ? 'oui' : 'non',
    lieu, groupe, rythmeCat: rythme, accord: f.accord, persona: f.persona, abonnee: abonnementActif(f, t) ? 'oui' : 'non', dePassage: f.dePassage ? 'oui' : 'non',
  };
}
export function tientLeCritere(cond: CritereDeLaMaison, v: ReturnType<typeof valeurs>): boolean {
  const type = CHAMPS[cond.champ]?.type ?? 'enum';
  let x = v[cond.champ];
  if (cond.champ === 'lieu' && String(cond.valeur).startsWith('grp:')) x = `grp:${v.groupe}`;
  if (type === 'num') {
    if (x == null) return false;
    const n = Number(cond.valeur);
    return cond.op === '<=' ? Number(x) <= n : cond.op === '=' ? Number(x) === n : Number(x) >= n;
  }
  return cond.op === '≠' ? x !== cond.valeur : x === cond.valeur;
}
const tientTout = (cat: CategorieDeLaMaison, v: ReturnType<typeof valeurs>) => cat.criteres.length > 0 && cat.criteres.every((c) => tientLeCritere(c, v));

export function classeLaCliente(f: FicheDuClassement, p: CriteresDuClassement, categories: readonly CategorieDeLaMaison[], t: string): ResultatDuClassement {
  const c = f.choix;
  /* Le lieu : le choix, la ville de la fiche, la marque diaspora, le numéro. */
  let lieu: string; let raisonLieu: string;
  if (c.lieu && LIEUX.some((l) => l.cle === c.lieu)) { lieu = c.lieu; raisonLieu = 'choisi par la Maison'; }
  else if (f.lieuSaisi && f.lieuSaisi !== 'non-reconnue') { lieu = f.lieuSaisi; raisonLieu = `ville sur la fiche : ${f.ville}${f.villeDeduite ? ' (déduite du numéro, à vérifier)' : ''}`; }
  else if (f.marquee) { lieu = REGION_VERS_LIEU[f.regionNumero] ?? 'dia-a-preciser'; raisonLieu = 'marquée diaspora' + (REGION_VERS_LIEU[f.regionNumero] ? `, numéro ${f.regionNumero}` : ''); }
  else if (REGION_VERS_LIEU[f.regionNumero] && p.numero_suffit) { lieu = REGION_VERS_LIEU[f.regionNumero]!; raisonLieu = `numéro ${f.regionNumero}`; }
  else if (f.regionNumero === 'Sans numéro' && !f.ville) { lieu = 'inconnu'; raisonLieu = 'ni ville ni numéro'; }
  else { lieu = p.ville_inconnue === 'cotonou' ? 'cotonou' : 'benin-a-preciser'; raisonLieu = f.ville ? `ville non reconnue : ${f.ville}` : 'numéro du Bénin, ville inconnue'; }
  const groupe = LIEUX.find((l) => l.cle === lieu)!.groupe;
  /* Le rythme : le choix, le déclaré, le mesuré. */
  let rj: number | null = null; let raisonRythme = 'moins de deux visites';
  if (c.rythme === 'une-par-an' || c.rythme === 'deux-par-an') { rj = RYTHMES_CHOISIS[c.rythme]; raisonRythme = c.rythme === 'une-par-an' ? 'une fois par an, choisi par la Maison' : 'deux fois par an, choisi par la Maison'; }
  else if (f.rythmeDeclare) { rj = f.rythmeDeclare; raisonRythme = `déclaré sur la fiche : toutes les ${Math.round(f.rythmeDeclare / 7)} semaines`; }
  else if (f.rythme && f.visites >= 2) { rj = f.rythme; raisonRythme = `mesuré sur ${f.visites} visites : ${f.rythme} jours`; }
  const rythme: CleDeRythme = rj == null ? 'inconnu' : rj >= p.annuelle_rythme ? 'annuelle' : rj <= p.reguliere_max ? 'reguliere' : 'espacee';
  const v = valeurs(f, lieu, groupe, rythme, rj, t);
  const depuis = f.derniere ? joursEntre(f.derniere, t) : null;
  const abo = abonnementActif(f, t);
  /* L'étape — CINQ CATÉGORIES (25 novembre 2026), dans cet ordre, la première
     qui s'applique l'emporte. La Privilégiée n'a pas de règle : la Maison l'y
     range depuis son dossier, et ce choix passe avant tout (plus bas).
       1. Sans catégorie : fiche d'essai, STOP, locks défaits, « de passage »
          posé à la main, ou aucune visite encore ;
       2. les catégories d'étape de la Maison qui ont des critères ;
       3. L'Annulée : une annulation récente, et rien depuis ;
       4. La Diaspora : elle vit à l'étranger ;
       5. La Dormante : trop longtemps sans venir (ou au-delà de son rythme
          d'une ou deux fois par an) ;
       6. La Régulière : toutes les autres, venues récemment. */
  let e: string | null = null; let raison = '';
  if (f.essai) { e = 'hors'; raison = 'fiche d’essai'; }
  else if (p.hors_stop && f.accord === 'stop') { e = 'hors'; raison = 'a dit STOP'; }
  else if (p.hors_locks && f.locksDefaits) { e = 'hors'; raison = 'a défait ses locks'; }
  else if (p.hors_passage_pose && f.passagePose) { e = 'hors'; raison = '« de passage » posé à la main'; }
  else if (f.visites === 0) { e = 'hors'; raison = f.prochain ? `aucune visite encore, rendez-vous le ${jourDit(f.prochain)}` : 'aucune visite encore'; }
  if (!e) { const pr = [...categories].sort((a, b) => a.ordre - b.ordre).find((x) => x.type === 'etape' && tientTout(x, v)); if (pr) { e = pr.id; raison = 'ses critères'; } }
  if (!e) {
    const dates = [...f.annulations, ...(p.annulee_absences ? f.absences : [])].sort();
    const der = dates[dates.length - 1];
    if (!f.prochain && der && joursEntre(der, t) <= p.annulee_jours && (!f.derniere || f.derniere < der)) {
      e = 'annulee'; raison = `${f.annulations.includes(der) ? 'annulé le' : 'rendez-vous resté « confirmé » le'} ${jourDit(der)}, aucune date depuis`;
    }
  }
  if (!e && p.diaspora_remplace && groupe === 'diaspora') { e = 'diaspora'; raison = `vit à l’étranger (${raisonLieu})`; }
  if (!e) {
    const d = depuis ?? 0;
    if (rj != null && rj >= p.annuelle_rythme) {
      if (d <= rj + p.annuelle_marge) { e = 'reguliere'; raison = `vient une ou deux fois par an (tous les ${rj} jours), dernière visite il y a ${d} jours`; }
      else { e = 'dormante'; raison = `au-delà de son rythme d’une ou deux fois par an : ${d} jours sans venir`; }
    } else if (d <= p.dormante_jours) { e = 'reguliere'; raison = `dernière visite il y a ${d} jours`; }
    else { e = 'dormante'; raison = `${d} jours sans venir`; }
  }
  const etapeAuto = e!;
  const toutes = [...ETAPES.map((x) => x.cle), ...categories.filter((x) => x.type === 'etape').map((x) => x.id)];
  const etape = c.etape && toutes.includes(c.etape) ? c.etape : etapeAuto;
  if (etape !== etapeAuto) raison = `choisie par la Maison (les critères disaient : ${nomDe([...ETAPES, ...categories.map((x) => ({ cle: x.id, nom: x.nom }))], etapeAuto)})`;
  /* Les marques */
  const m: string[] = [];
  if (abo && !f.prochain) m.push('abonnee-sans-rdv');
  if (dansLesMois(f.annulations, p.annule_mois, t) + (p.annule_absences ? dansLesMois(f.absences, p.annule_mois, t) : 0) >= p.annule_nb) m.push('annule-souvent');
  if (f.absences.length) m.push('absences');
  if (!abo && f.abonnements.length) m.push('ancienne-abonnee');
  if (REGION_VERS_LIEU[f.regionNumero] && !f.marquee && !c.lieu) m.push('diaspora-a-confirmer');
  if (f.regionNumero === 'Sans numéro') m.push('sans-numero');
  if (f.dePassage) m.push('de-passage');
  for (const x of categories) if (x.type === 'marque' && tientTout(x, v)) m.push(x.id);
  return { etape, etapeAuto, lieu, groupe, rythme, rythmeJours: rj, marques: m, raisons: { etape: raison, lieu: raisonLieu, rythme: raisonRythme } };
}

/** Les catégories de la Maison telles qu'un document les porte, nettoyées. */
export function categoriesLues(brut: unknown): CategorieDeLaMaison[] {
  if (!Array.isArray(brut)) return CATEGORIES_DE_DEPART.map((c) => ({ ...c, criteres: [...c.criteres] }));
  return brut.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
    .map((x, i) => ({
      id: String(x.id), nom: String(x.nom ?? '').trim() || 'Sans nom', regle: String(x.regle ?? ''),
      type: x.type === 'marque' ? 'marque' as const : 'etape' as const,
      criteres: Array.isArray(x.criteres) ? (x.criteres as CritereDeLaMaison[]).filter((c) => c && typeof c.champ === 'string' && c.champ in CHAMPS) : [],
      ordre: typeof x.ordre === 'number' ? x.ordre : i,
    }));
}

/* ══ LA DÉFINITION D'UNE CATÉGORIE, LUE — 25 novembre 2026 ══════════════
   « Quand je prends la Curieuse, c'est quoi la Curieuse ? Quand je prends la
   Disparue, c'est quoi la Disparue ? Où se trouvent les définitions ? »
   (Yéman). Les définitions ne se lisaient que dans « Les critères » ; ouverte
   depuis la colonne, une catégorie montrait ses fiches sans dire qui y entre.
   Elle le dit désormais en tête de sa liste, avec les chiffres EN VIGUEUR
   (ceux que `classeLaCliente` applique), et « Modifier la définition » mène à
   sa carte des critères. Changer une règle de `classeLaCliente`, c'est
   changer sa phrase ici : le banc les tient ensemble. */

/** Les valeurs qu'un critère de la Maison peut prendre, et leur nom. */
export function optionsDuChamp(ch: ChampDeCritere): [string, string][] {
  if (ch === 'lieu') return [...GROUPES_DE_LIEU.map((g): [string, string] => [`grp:${g.cle}`, `Groupe : ${g.nom}`]), ...LIEUX.map((l): [string, string] => [l.cle, l.nom])];
  if (ch === 'rythmeCat') return RYTHMES.map((r): [string, string] => [r.cle, r.nom]);
  if (ch === 'accord') return [['oui', 'a dit oui'], ['non', 'a dit « Non merci »'], ['stop', 'STOP'], ['inconnu', 'jamais répondu']];
  if (ch === 'persona') return [['p-initie', 'Initiée'], ['p-constante', 'Constante'], ['p-lointaine', 'Lointaine'], ['p-convalescente', 'Convalescente'], ['p-souveraine', 'Souveraine'], ['p-naissante', 'Naissante'], ['p-lumineuse', 'Lumineuse'], ['p-pressee', 'Pressée']];
  if (CHAMPS[ch].type === 'bool') return [['oui', 'oui'], ['non', 'non']];
  return [];
}

/** Un critère de la Maison, dit en mots : « Nombre de visites : au moins 2 ». */
export function critereDit(c: CritereDeLaMaison): string {
  const champ = CHAMPS[c.champ];
  if (!champ) return '';
  if (champ.type === 'num') return `${champ.nom} : ${c.op === '<=' ? 'au plus' : c.op === '=' ? 'exactement' : 'au moins'} ${Number(c.valeur) || 0}`;
  const nom = optionsDuChamp(c.champ).find(([v]) => v === String(c.valeur))?.[1] ?? String(c.valeur);
  return `${champ.nom} : ${c.op === '≠' ? 'n’est pas' : 'est'} ${nom}`;
}

const listeDite = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`);

/** Les mots de La Privilégiée (25 novembre 2026, Yéman) : elle ne se calcule
    pas, la Maison la reconnaît. */
export const LA_PRIVILEGIEE_DITE = 'Elle ne négocie pas les prix, elle a besoin d’une attention particulière, et elle dit oui à nos services sans difficulté.';

/** Qui entre dans la catégorie d'une vue de la colonne (`e:reguliere`,
    `e:<catégorie de la Maison>`, `m:<marque de la Maison>`), en mots et avec
    les chiffres en vigueur ; `null` pour une vue qui n'est pas une catégorie
    (« Toutes les fiches »). Cinq catégories depuis le 25 novembre 2026. */
export function definitionDeLaVue(vue: string, p: CriteresDuClassement, categories: readonly CategorieDeLaMaison[]): string | null {
  const k = vue.slice(2);
  const cat = categories.find((x) => x.id === k);
  if ((vue.startsWith('e:') || vue.startsWith('m:')) && cat) {
    const regle = cat.regle.trim();
    const criteres = cat.criteres.map(critereDit).filter(Boolean);
    const quoi = cat.type === 'marque' ? 'Une marque de la Maison' : 'Une catégorie de la Maison, lue juste après « Sans catégorie »';
    const ou = criteres.length
      ? `${quoi}. Elle y entre si tous ses critères tiennent : ${criteres.join(' ; ')}.`
      : `${quoi}, sans critère : on y range une fiche à la main, depuis son dossier.`;
    return regle ? `${regle} ${ou}` : ou;
  }
  if (!vue.startsWith('e:')) return null;
  switch (k) {
    case 'privilegiee': return `${LA_PRIVILEGIEE_DITE} Le Trône ne la devine pas : la Maison l’y range depuis son dossier, et ce choix passe avant tous les critères.`;
    case 'reguliere': return `Elle est venue, et sa dernière visite date de ${p.dormante_jours} jours au plus. Celle qui vient une ou deux fois par an (un rythme de ${p.annuelle_rythme} jours ou plus) y reste tant qu’elle est dans son rythme, avec ${p.annuelle_marge} jours de marge.`;
    case 'annulee': return `Une annulation${p.annulee_absences ? ' (ou un rendez-vous passé resté « confirmé »)' : ''} il y a ${p.annulee_jours} jours au plus, et ni visite ni rendez-vous depuis. Elle passe avant la Diaspora, la Dormante et la Régulière.`;
    case 'dormante': return `Sa dernière visite date de plus de ${p.dormante_jours} jours. Celle qui vient une ou deux fois par an n’y entre qu’au-delà de son rythme et de ${p.annuelle_marge} jours de marge.`;
    case 'diaspora': return p.diaspora_remplace
      ? `Elle vit à l’étranger : le lieu choisi dans son dossier, une ville de l’étranger sur sa fiche, la marque diaspora${p.numero_suffit ? ', ou un numéro étranger' : ' (un numéro étranger seul ne suffit pas)'}. Ses relances suivent ses séjours ; seule une annulation récente passe avant.`
      : 'Désactivée : une cliente qui vit à l’étranger se range comme les autres, Régulière ou Dormante.';
    case 'hors': {
      const quand = [
        'elle n’est encore jamais venue (même avec un rendez-vous à venir)',
        ...(p.hors_stop ? ['elle a dit STOP'] : []),
        ...(p.hors_locks ? ['elle a défait ses locks'] : []),
        ...(p.hors_passage_pose ? ['la Maison l’a marquée « de passage » à la main'] : []),
        'c’est une fiche d’essai',
      ];
      return `Ce n’est pas une catégorie : la fiche y reste si ${listeDite(quand)}.`;
    }
    default: return null;
  }
}

/** La carte de « Les critères » où se règle la catégorie d'une vue ;
    `null` : rien à y régler. */
export function carteDeLaVue(vue: string, categories: readonly CategorieDeLaMaison[]): string | null {
  const k = vue.slice(2);
  if ((vue.startsWith('e:') || vue.startsWith('m:')) && categories.some((x) => x.id === k)) return `def-cat:${k}`;
  if (vue.startsWith('e:')) return ETAPES.some((x) => x.cle === k) ? `def-e:${k}` : null;
  return null;
}
