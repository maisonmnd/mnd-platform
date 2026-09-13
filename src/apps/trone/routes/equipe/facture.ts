import { createStore, useStore } from '../../../../shared/store';
import { bindCollection } from '../../../../shared/sync';
import { sameName } from '../../../../shared/text';
import { signatureInvalide, type SignatureTracee } from '../../../../shared/contrats';
import type { Appointment } from '../../../../shared/agenda';
import type { Service } from '../../../../shared/catalog';
import type { StaffMember } from './data';
import { asArray, echeanceReglement, ligneDePrestataire, type PayrollLine, type PayrollRun } from './payroll';

/* ══ LA FACTURE DU PRESTATAIRE — 13 septembre 2026 ═══════════════════════

   « J'aimerais que les employés du salon me remplissent une facture en tant
   que prestataire tous les mois. Ce document doit porter leurs noms, prénoms,
   tel, mail et IFU et les lignes de prestation avec un montant total et leur
   signature. À soumettre tous les mois avant leur paie » (Yéman).

   Ce qui a été tranché, maquette validée :
   · selon la personne : seules les fiches « prestataire » facturent ;
   · les lignes arrivent PRÉ-REMPLIES depuis le Carnet ;
   · « c'est moi qui écris le prix » : une grille par personne, sur sa fiche ;
   · « un résumé de ligne de montant pour chaque semaine du mois, du mardi au
     samedi » ; un jour de fermeture travaillé compte dans la semaine d'avant ;
   · AU FORFAIT (un montant dans « Salaire de base ») : « prendre la base de
     son salaire, diviser par 4 semaines, sans compter le nombre de
     prestations ; le forfait est négocié à la signature du contrat, hors
     bonus et augmentation ». Quatre lignes égales, la semaine coupée par le
     mois rejoint sa voisine, les bonus se versent hors facture, dans la
     paie. Sans montant sur la fiche, la grille par prestation reste ;
   · les produits de la Gamme n'y entrent pas ;
   · soumise avant le 5, et la paie ne se valide pas sans facture acceptée ;
   · la paie verse le montant facturé, sans CNSS ni ITS.

   CE MODULE EST LE SEUL JUGE. L'écran de la prestataire, celui de la
   direction, le PDF et la paie l'interrogent tous : deux calculs du même
   total finiraient par ne plus payer la même somme. */

/* ---------- Les jours, à midi local ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aMidi = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const plusJours = (iso: string, n: number): string => {
  const d = aMidi(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
};

export const aujourdhuiIso = (): string => isoDe(new Date());

export const dernierJourDuMois = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return isoDe(new Date(a, m, 0, 12));
};

/** Le mois écoulé : c'est lui qu'on facture, du 1er au 5. */
export const moisEcoule = (jour: string): string => {
  const [a, m] = jour.slice(0, 7).split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`;
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const quantieme = (iso: string) => {
  const n = Number(iso.slice(8, 10));
  return n === 1 ? '1er' : String(n);
};

export const moisDit = (mois: string): string => `${MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`;
export const jourCourtDit = (iso: string): string => `${JOURS_COURTS[aMidi(iso).getDay()]} ${quantieme(iso)}`;
/** « 1er octobre 2026 ». */
export const dateDite = (iso: string): string =>
  `${quantieme(iso)} ${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/* ══ LES SEMAINES DU MARDI AU SAMEDI ═══════════════════════════════════
   « Un résumé de ligne de montant pour chaque semaine du mois, du mardi au
   samedi. » La semaine s'ouvre le mardi. Le dimanche et le lundi, jours de
   fermeture, reviennent à la semaine qui les PRÉCÈDE (arbitrage du 13
   septembre) : une ouverture exceptionnelle ne crée pas de ligne à part.

   LE MOIS COUPE LES SEMAINES. Une semaine commencée en août ne garde que ses
   jours de septembre : chaque facture tient dans son mois, et un jour ne se
   facture jamais deux fois. */

/** Le mardi qui ouvre la semaine d'un jour. */
export const mardiDe = (iso: string): string => plusJours(iso, -((aMidi(iso).getDay() + 5) % 7));

export type SemaineDuMois = {
  /** Le mardi qui l'ouvre, parfois au mois d'avant. */
  cle: string;
  /** Son premier jour dans le mois. */
  debut: string;
  /** Son dernier jour dans le mois, dimanche et lundi compris. */
  fin: string;
  /** Le jour qu'on écrit : le samedi, ou le dernier jour du mois. */
  finAffichee: string;
  /** Porte-t-elle au moins un jour du mardi au samedi dans le mois ? */
  ouvree: boolean;
};

export function semainesDuMois(mois: string): SemaineDuMois[] {
  const premier = `${mois}-01`;
  const dernier = dernierJourDuMois(mois);
  const out: SemaineDuMois[] = [];
  for (let mardi = mardiDe(premier); mardi <= dernier; mardi = plusJours(mardi, 7)) {
    const debut = mardi < premier ? premier : mardi;
    const samedi = plusJours(mardi, 4);
    const lundi = plusJours(mardi, 6);
    const fin = lundi > dernier ? dernier : lundi;
    const finOuvree = samedi > dernier ? dernier : samedi;
    const ouvree = debut <= finOuvree;
    out.push({ cle: mardi, debut, fin, finAffichee: ouvree ? finOuvree : fin, ouvree });
  }
  return out;
}

/** « Du mardi 1er au samedi 5 septembre ». */
export function libelleDeSemaine(debut: string, fin: string, o: { annee?: boolean } = {}): string {
  const suffixe = `${MOIS[Number(debut.slice(5, 7)) - 1]}${o.annee ? ` ${debut.slice(0, 4)}` : ''}`;
  const jour = (iso: string) => `${JOURS[aMidi(iso).getDay()]} ${quantieme(iso)}`;
  if (debut === fin) return `Le ${jour(debut)} ${suffixe}`;
  return `Du ${jour(debut)} au ${jour(fin)} ${suffixe}`;
}

/* ---------- Les types ---------- */
export type EtatDeFacture = 'brouillon' | 'soumise' | 'acceptee' | 'refusee';
export const ETAT_DE_FACTURE_MOT: Record<EtatDeFacture, string> = {
  brouillon: 'Brouillon', soumise: 'Soumise', acceptee: 'Acceptée', refusee: 'Refusée',
};

export type IdentiteDuPrestataire = {
  nom: string; prenoms: string; telephone: string; email: string; ifu: string;
};

/** UNE PRESTATION OUBLIÉE, SIGNALÉE PAR ELLE. Elle part sans prix quand elle
    n'est pas au catalogue ou pas dans sa grille : la direction l'écrit. */
export type PrestationSignalee = {
  id: string;
  date: string;
  serviceId?: string;
  libelle: string;
  /** Écrit par la direction, pour une prestation hors catalogue. */
  prixXof?: number;
};

export type LigneDeFacture = {
  date: string;
  serviceId?: string;
  libelle: string;
  /** null = le prix n'est pas encore écrit. */
  prixXof: number | null;
  rdvId?: string;
  signaleeId?: string;
};

export type SemaineDeFacture = {
  debut: string;
  /** Le jour écrit en fin de ligne (voir `SemaineDuMois.finAffichee`). */
  fin: string;
  lignes: LigneDeFacture[];
  montantXof: number;
  prixManquants: number;
};

export type CompteDeFacture = {
  mois: string;
  /** « forfait » : le montant de la fiche en quatre semaines égales, sans
      prestation. Absent sur un compte d'avant : la grille. */
  mode?: 'grille' | 'forfait';
  semaines: SemaineDeFacture[];
  forfaitXof: number;
  totalXof: number;
  prixManquants: number;
  nombre: number;
};

export type FacturePrestataire = {
  /** `fp-<mois>-<fiche>` : une seule facture par personne et par mois. */
  id: string;
  branchId: string;
  staffId: string;
  mois: string;
  /** Le compte qui l'écrit. La base ne la laisse lire et écrire qu'à lui et à
      la direction (migration 0090). */
  auteurId?: string;
  numero: string;
  identite: IdentiteDuPrestataire;
  signalees: PrestationSignalee[];
  etat: EtatDeFacture;
  signature?: SignatureTracee;
  soumiseLe?: string;
  /** Ce qu'elle a vu et signé. */
  compteSoumis?: CompteDeFacture;
  /** FIGÉ PAR LA DIRECTION À L'ACCEPTATION, recalculé sur son poste depuis le
      Carnet et la grille : c'est lui, et lui seul, qui paie. Le compte soumis
      est écrit par le poste de la prestataire ; on ne paie pas sur sa parole. */
  compteAccepte?: CompteDeFacture;
  accepteeLe?: string;
  accepteePar?: string;
  refus?: { le: string; par: string; mot: string };
  creeLe: string;
  modifieeLe?: string;
};

/* ---------- Qui facture, et à quel prix ---------- */
export const estPrestataire = (m?: Pick<StaffMember, 'contractType'> | null): boolean =>
  m?.contractType === 'prestataire';

export const prixDeLaGrille = (m: Pick<StaffMember, 'grille'>, serviceId?: string): number | null => {
  if (!serviceId) return null;
  const v = m.grille?.[serviceId];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
};

/** LE FORFAIT DU MOIS, négocié à la signature du contrat : le « Salaire de
    base » de sa fiche. Posé, la facture passe au forfait. */
export const forfaitDe = (m: Pick<StaffMember, 'salaireXof'>): number =>
  (m.salaireXof ?? 0) > 0 ? Math.round(m.salaireXof) : 0;

/** Les mains d'un geste : celles désignées, sinon le maître assigné. La MÊME
    règle que la commission (`commissionDetaillee`). */
export const mainsDuGeste = (
  a: Pick<Appointment, 'mains' | 'master'>, i: number, team: readonly Pick<StaffMember, 'id' | 'name'>[],
): string[] =>
  (a.mains?.[i]?.length ? a.mains[i] : team.filter((x) => sameName(x.name, a.master)).map((x) => x.id));

export type ContexteDesPrestations = {
  appts: readonly Appointment[];
  byId: Map<string, Service>;
  team: readonly Pick<StaffMember, 'id' | 'name'>[];
  branchId: string;
};

/* ══ SES PRESTATIONS, DEPUIS LE CARNET ═════════════════════════════════
   Un geste honoré où elle a mis la main compte UNE prestation pour elle, au
   prix de SA grille : un rituel à deux mains en compte une pour chacune.

   UN GESTE RÉPARTI SUR PLUSIEURS SÉANCES NE SE FACTURE QU'UNE FOIS par
   personne, à la date où elle y a travaillé pour la première fois. C'est la
   règle de la Maison pour une série (la séance 1 porte le prix) ; payer la
   même prestation à chaque séance la ferait payer deux ou trois fois. */
export function sesPrestations(m: Pick<StaffMember, 'id' | 'grille'>, ctx: ContexteDesPrestations): LigneDeFacture[] {
  const vues = new Map<string, LigneDeFacture>();
  const honores = asArray(ctx.appts as Appointment[])
    .filter((a) => a && a.branchId === ctx.branchId && a.status === 'honoré' && !!a.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  for (const a of honores) {
    const rangs = new Map<string, number>();
    a.serviceIds.forEach((sid, i) => {
      const rang = rangs.get(sid) ?? 0;
      rangs.set(sid, rang + 1);
      const sv = ctx.byId.get(sid);
      if (!sv || !mainsDuGeste(a, i, ctx.team).includes(m.id)) return;
      const cle = a.seriesId ? `s:${a.seriesId}|${sid}|${rang}` : `r:${a.id}|${i}`;
      if (vues.has(cle)) return;
      vues.set(cle, {
        date: a.date.slice(0, 10), serviceId: sid, libelle: sv.name, prixXof: prixDeLaGrille(m, sid), rdvId: a.id,
      });
    });
  }
  return [...vues.values()];
}

export const prestationsDuMois = (
  m: Pick<StaffMember, 'id' | 'grille'>, mois: string, ctx: ContexteDesPrestations,
): LigneDeFacture[] => sesPrestations(m, ctx).filter((l) => l.date.slice(0, 7) === mois);

export const signaleesEnLignes = (
  m: Pick<StaffMember, 'grille'>, mois: string, signalees: readonly PrestationSignalee[] | undefined,
): LigneDeFacture[] =>
  asArray(signalees as PrestationSignalee[])
    .filter((s) => s && (s.date ?? '').slice(0, 7) === mois)
    .map((s) => ({
      date: s.date.slice(0, 10),
      serviceId: s.serviceId,
      libelle: s.libelle,
      prixXof: typeof s.prixXof === 'number' && s.prixXof >= 0 ? Math.round(s.prixXof) : prixDeLaGrille(m, s.serviceId),
      signaleeId: s.id,
    }));

/** Le compte : une ligne par semaine, le forfait, le total. */
export function compteDeLaFacture(lignes: readonly LigneDeFacture[], mois: string, forfaitXof = 0): CompteDeFacture {
  const semaines = semainesDuMois(mois);
  const parCle = new Map<string, LigneDeFacture[]>(semaines.map((s) => [s.cle, []]));
  for (const l of lignes) {
    if (l.date.slice(0, 7) !== mois) continue;
    const s = semaines.find((x) => x.debut <= l.date && l.date <= x.fin);
    if (s) parCle.get(s.cle)!.push(l);
  }
  const out: SemaineDeFacture[] = semaines
    .filter((s) => s.ouvree || parCle.get(s.cle)!.length > 0)
    .map((s) => {
      const ls = parCle.get(s.cle)!
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle, 'fr'));
      return {
        debut: s.debut,
        fin: s.finAffichee,
        lignes: ls,
        montantXof: ls.reduce((n, l) => n + (l.prixXof ?? 0), 0),
        prixManquants: ls.filter((l) => l.prixXof === null).length,
      };
    });
  const forfait = Math.max(0, Math.round(forfaitXof));
  return {
    mois,
    mode: 'grille',
    semaines: out,
    forfaitXof: forfait,
    totalXof: out.reduce((n, s) => n + s.montantXof, 0) + forfait,
    prixManquants: out.reduce((n, s) => n + s.prixManquants, 0),
    nombre: out.reduce((n, s) => n + s.lignes.length, 0),
  };
}

/* ══ LE FORFAIT EN QUATRE SEMAINES — 13 septembre 2026 ═════════════════
   « Il faut prendre la base de son salaire, diviser par 4 semaines. Mais il
   ne faut pas compter le nombre de prestations effectuées » (Yéman).

   QUATRE LIGNES, TOUJOURS. Un mois porte quatre ou cinq semaines du mardi au
   samedi. Quand il en porte cinq, la plus courte (celle que le mois coupe)
   rejoint sa voisine : septembre 2026 se lit « du mardi 22 au mercredi 30 ».
   À égalité, c'est la dernière qui rejoint l'avant-dernière. Un dimanche et
   un lundi seuls en début de mois ne font pas de ligne : rien ne s'y compte. */
export function semainesDuForfait(mois: string): { debut: string; fin: string }[] {
  const jours = (s: { debut: string; fin: string }) =>
    Math.round((aMidi(s.fin).getTime() - aMidi(s.debut).getTime()) / 86400000) + 1;
  const lignes = semainesDuMois(mois).filter((s) => s.ouvree).map((s) => ({ debut: s.debut, fin: s.finAffichee }));
  while (lignes.length > 4) {
    let i = 0;
    for (let k = 1; k < lignes.length; k++) if (jours(lignes[k]) <= jours(lignes[i])) i = k;
    const voisin = i === 0 ? 1
      : i === lignes.length - 1 ? i - 1
        : (jours(lignes[i - 1]) <= jours(lignes[i + 1]) ? i - 1 : i + 1);
    const a = Math.min(i, voisin);
    const b = Math.max(i, voisin);
    lignes.splice(a, 2, { debut: lignes[a].debut, fin: lignes[b].fin });
  }
  return lignes;
}

/** Le forfait ÷ 4. Un montant qui ne se divise pas juste laisse son reste à
    la dernière semaine : le total fait toujours le forfait, au franc près. */
export function compteAuForfait(mois: string, forfaitXof: number): CompteDeFacture {
  const forfait = Math.max(0, Math.round(forfaitXof));
  const lignes = semainesDuForfait(mois);
  const n = Math.max(1, lignes.length);
  const quart = Math.floor(forfait / n);
  const semaines: SemaineDeFacture[] = lignes.map((l, i) => ({
    debut: l.debut,
    fin: l.fin,
    lignes: [],
    montantXof: i === lignes.length - 1 ? forfait - quart * (n - 1) : quart,
    prixManquants: 0,
  }));
  return { mois, mode: 'forfait', semaines, forfaitXof: forfait, totalXof: forfait, prixManquants: 0, nombre: 0 };
}

/** LE COMPTE DU MOIS, selon la fiche : au forfait quand elle porte un
    montant (les prestations ne se comptent pas), à la grille sinon. */
export const compteDuMois = (
  m: Pick<StaffMember, 'id' | 'grille' | 'salaireXof'>,
  mois: string,
  signalees: readonly PrestationSignalee[] | undefined,
  ctx: ContexteDesPrestations,
): CompteDeFacture => {
  const forfait = forfaitDe(m);
  if (forfait > 0) return compteAuForfait(mois, forfait);
  return compteDeLaFacture([...prestationsDuMois(m, mois, ctx), ...signaleesEnLignes(m, mois, signalees)], mois);
};

/* ---------- L'identité et le numéro ---------- */
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** « +229 » tout seul, laissé par le formulaire du personnel, n'est pas un numéro. */
const vraiNumero = (t?: string) => ((t ?? '').replace(/\D/g, '').length >= 8 ? (t ?? '').trim() : '');

/** Proposée d'après la facture précédente, sinon d'après sa fiche : le nom de
    famille est le mot en capitales, à défaut le dernier. Tout se corrige. */
export function identiteProposee(
  m: Pick<StaffMember, 'name' | 'phone' | 'email' | 'ifu'>,
  precedente?: IdentiteDuPrestataire,
): IdentiteDuPrestataire {
  if (precedente) {
    return {
      ...precedente,
      telephone: precedente.telephone || vraiNumero(m.phone),
      email: precedente.email || (m.email ?? '').trim(),
      ifu: precedente.ifu || (m.ifu ?? '').trim(),
    };
  }
  const mots = (m.name ?? '').trim().split(/\s+/).filter(Boolean);
  let nom = '';
  let prenoms = '';
  if (mots.length === 1) nom = mots[0];
  else if (mots.length > 1) {
    const capitale = mots.findIndex((w) => w.length > 1 && /\p{L}/u.test(w) && w === w.toLocaleUpperCase('fr'));
    const i = capitale >= 0 ? capitale : mots.length - 1;
    nom = mots[i];
    prenoms = mots.filter((_, k) => k !== i).join(' ');
  }
  return { nom, prenoms, telephone: vraiNumero(m.phone), email: (m.email ?? '').trim(), ifu: (m.ifu ?? '').trim() };
}

/** « AD-2026-09 » : ses initiales, l'année, le mois. */
export function numeroPropose(id: Pick<IdentiteDuPrestataire, 'nom' | 'prenoms'>, mois: string): string {
  const lettre = (s: string) => sansAccent(s.trim()).replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const initiales = `${lettre(id.prenoms)}${lettre(id.nom)}` || 'F';
  return `${initiales}-${mois.slice(0, 4)}-${mois.slice(5, 7)}`;
}

export const ifuValide = (ifu: string): boolean => /^\d{13}$/.test(ifu.replace(/\s/g, ''));

/** CE QUI MANQUE POUR SOUMETTRE. Un seul juge, dit en clair. */
export function ceQuiManqueASoumettre(
  f: { identite: IdentiteDuPrestataire; numero: string; signature?: Partial<SignatureTracee> },
): string | undefined {
  const i = f.identite;
  if (!i.nom.trim()) return 'Écrivez votre nom.';
  if (!i.prenoms.trim()) return 'Écrivez vos prénoms.';
  if (i.telephone.replace(/\D/g, '').length < 8) return 'Écrivez votre numéro de téléphone.';
  if (!/^\S+@\S+\.\S+$/.test(i.email.trim())) return 'Écrivez une adresse e-mail valable.';
  if (!ifuValide(i.ifu)) return 'L’IFU compte 13 chiffres, il est obligatoire pour soumettre.';
  if (!f.numero.trim()) return 'Donnez un numéro à la facture.';
  if (signatureInvalide(f.signature)) return 'Signez la facture avant de la soumettre.';
  return undefined;
}

export const ceQuiManqueAAccepter = (c: Pick<CompteDeFacture, 'prixManquants'>): string | undefined =>
  (c.prixManquants > 0
    ? `${c.prixManquants} prix à écrire avant d’accepter.`
    : undefined);

/* ---------- Le montant en toutes lettres ---------- */
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

const moinsDeCent = (n: number, finale: boolean): string => {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    if (d === 7 && u === 1) return 'soixante et onze';
    return `${DIZAINES[d]}-${UNITES[10 + u]}`;
  }
  if (u === 0) return d === 8 ? (finale ? 'quatre-vingts' : 'quatre-vingt') : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
};

const moinsDeMille = (n: number, finale: boolean): string => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (c > 0) s = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && finale ? 's' : ''}`;
  if (r > 0) s = s ? `${s} ${moinsDeCent(r, finale)}` : moinsDeCent(r, finale);
  return s;
};

/** « quatre-vingt-sept mille ». Un chiffre se rature, une somme écrite se
    conteste : la facture porte les deux. */
export function nombreEnLettres(x: number): string {
  const n = Math.round(Math.abs(x));
  if (n === 0) return 'zéro';
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor(n / 1e6) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const reste = n % 1000;
  const parts: string[] = [];
  if (milliards) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(' ');
}

/* ---------- Le magasin ---------- */
export const factureId = (mois: string, staffId: string): string => `fp-${mois}-${staffId}`;

export const facturesPrestatairesStore = createStore<FacturePrestataire[]>('mnd_factures_prestataires', []);
export const useFacturesPrestataires = (): [FacturePrestataire[], typeof facturesPrestatairesStore.set] => {
  const [v, set] = useStore(facturesPrestatairesStore);
  return [asArray<FacturePrestataire>(v), set];
};
bindCollection(facturesPrestatairesStore, 'factures_prestataires');

export const factureDe = (
  factures: readonly FacturePrestataire[], staffId: string, mois: string,
): FacturePrestataire | undefined =>
  asArray(factures as FacturePrestataire[]).find((f) => f && f.staffId === staffId && f.mois === mois);

/** Le total qui paie, et seulement une fois la facture acceptée. */
export const totalAccepte = (f?: FacturePrestataire): number | undefined =>
  (f?.etat === 'acceptee' && f.compteAccepte ? f.compteAccepte.totalXof : undefined);

/** Soumise avant le 5 du mois suivant. */
export const echeanceDeLaFacture = (mois: string): string => echeanceReglement(mois);

export const enRetard = (f: Pick<FacturePrestataire, 'etat'> | undefined, mois: string, jour: string): boolean =>
  (!f || f.etat === 'brouillon' || f.etat === 'refusee') && jour > echeanceDeLaFacture(mois);

/* ══ LA PAIE ATTEND LA FACTURE ═════════════════════════════════════════
   « Bloquée » (Yéman). Tant qu'une prestataire du run n'a pas de facture
   acceptée pour le mois, la paie ne se valide pas. Une ligne compte comme
   prestataire par sa marque, ou par sa fiche d'aujourd'hui : un run créé
   avant la marque ne passe pas entre les mailles. */
export function prestatairesSansFactureAcceptee(
  lines: readonly PayrollLine[],
  period: string,
  staff: readonly Pick<StaffMember, 'id' | 'contractType'>[],
  factures: readonly FacturePrestataire[],
): PayrollLine[] {
  const parId = new Map(asArray(staff as StaffMember[]).map((m) => [m.id, m]));
  return asArray(lines as PayrollLine[]).filter((l) => (l.prestataire || estPrestataire(parId.get(l.employeeId)))
    && totalAccepte(factureDe(factures, l.employeeId, period)) === undefined);
}

/** À l'acceptation, le total entre dans les runs encore en brouillon du mois. */
export function reporteLaFactureDansLaPaie(runs: readonly PayrollRun[], f: FacturePrestataire): PayrollRun[] {
  const total = totalAccepte(f);
  if (total === undefined) return [...runs];
  return runs.map((r) => (r.period === f.mois && r.status === 'brouillon' && (!r.branchId || r.branchId === f.branchId)
    ? { ...r, lines: asArray(r.lines).map((l) => (l.employeeId === f.staffId ? ligneDePrestataire(l, total, f.id) : l)) }
    : r));
}
