/* ══ LE MOMENT PROGRAMME SES SÉANCES À VENIR, PUR — 7 novembre 2026 ═══════════
   « Quand je prends Le Moment pour un client, ça doit automatiquement
   programmer les séances à venir » (Yéman).

   Au nouveau RDV, dès que Le Moment est choisi (cuir chevelu : 4 venues,
   Signature : 3), les venues suivantes se PROPOSENT d'office :
   · la date = celle de la venue 1 + le délai du catalogue (`afterWeeks` de la
     première ligne de CETTE venue dans `includes`, repère `venue`), donc le
     même jour de la semaine, à la même heure ;
   · si ce jour est fermé ou si la place n'est pas libre, le jour libre le plus
     proche : la même semaine d'abord, de préférence un jour favori de la
     cliente, jamais avant 9 h le samedi ; et la phrase dit POURQUOI la date a
     bougé ;
   · une venue dans le passé se dit, elle ne se pose jamais en silence.
   Les dates restent MODIFIABLES avant d'enregistrer.

   LE CHOIX DE PAIEMENT NE CONDITIONNE PLUS LA PROGRAMMATION : « Comptant » et
   « plusieurs venues » posent toutes les venues suivantes. En « Comptant »
   elles se posent à 0 F (déjà réglées) avec la marque du plan
   (`momentProgramme`, même `planId`, `rang`) : le staff lit « venue 2 sur 4 ».

   Ce fichier n'importe rien : il juge des dates, pas des places. L'écran lui
   passe ses deux juges (`ferme`, `heuresLibres`), les mêmes que le choix de
   date du nouveau RDV. */

import type { MomentEnTrois } from './le-moment-en-trois-pur';

/** Ce que porte un rendez-vous d'un Moment programmé en « Comptant » : la marque du plan, sans argent. */
export type MomentProgramme = { planId: string; rang: number; n: number };

/** LES DÉLAIS PAR DÉFAUT, quand le catalogue ne répartit pas encore les venues : le cuir chevelu à 4/8/12 semaines
    (quatre venues), le Moment Signature à 8/12 semaines (trois). */
export const DELAIS_PAR_DEFAUT: Record<number, readonly number[]> = { 3: [8, 12], 4: [4, 8, 12] };

type IncluLu = { afterWeeks?: number; venue?: number };

/** LES DÉLAIS DES VENUES 2 À N, EN SEMAINES, depuis `includes` du service :
    · le catalogue répartit par venue (`venue`) : l'`afterWeeks` de la PREMIÈRE ligne de chaque venue ;
    · sinon les délais distincts, du plus court au plus long ;
    · ce qui manque se complète par le défaut. Jamais un délai nul ou négatif. */
export function delaisDesVenues(inclus: readonly IncluLu[] | undefined, n: number): number[] {
  const lignes = inclus ?? [];
  const positif = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
  const defaut = DELAIS_PAR_DEFAUT[n] ?? Array.from({ length: n - 1 }, (_, i) => 4 * (i + 1));
  const reparti = lignes.some((l) => typeof l.venue === 'number');
  const distincts = [...new Set(lignes.map((l) => l.afterWeeks).filter(positif))].sort((a, b) => a - b);
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => {
    const rang = i + 2;
    if (reparti) {
      const premiere = lignes.find((l) => l.venue === rang && positif(l.afterWeeks));
      if (premiere) return premiere.afterWeeks as number;
    } else if (distincts[i] !== undefined) return distincts[i];
    return defaut[i] ?? 4 * (i + 1);
  });
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 19 déc. » : la date courte, pour l'équipe. */
export const jourCourt = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MOIS_COURTS[Number(m[2]) - 1]}` : '';
};
/** « 11 h », « 12 h 30 ». */
export const heureDite = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? `${Number(m[1])} h${m[2] === '00' ? '' : ` ${m[2]}`}` : hhmm;
};
const minutes = (hhmm: string): number => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

const ajouteJours = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Le jour de la semaine, 0 = dimanche. */
const jourDeLaSemaine = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Le lundi de la semaine de ce jour. */
const lundiDe = (iso: string): string => ajouteJours(iso, -((jourDeLaSemaine(iso) + 6) % 7));

/** Le samedi n'ouvre jamais avant 9 h (6 novembre 2026, « personne n'a le droit d'avoir dans son calendrier 8 h 30 un samedi »). */
export const OUVERTURE_DU_SAMEDI = '09:00';
const heureValable = (iso: string, t: string): boolean => !(jourDeLaSemaine(iso) === 6 && minutes(t) < minutes(OUVERTURE_DU_SAMEDI));

export type PropositionDeVenue = {
  /** La date proposée ; vide quand aucune place n'a été trouvée. */
  date: string;
  time: string;
  /** La date de la grille (venue 1 + délai), avant tout déplacement. */
  cible: string;
  semaines: number;
  /** La date a bougé de sa cible. */
  deplacee: boolean;
  /** Pourquoi elle a bougé, ou pourquoi elle ne se pose pas (jamais en silence). */
  raison?: string;
  /** La venue tombe dans le passé : elle ne se pose pas. */
  passee?: boolean;
};

/** LES DATES PROPOSÉES DES VENUES 2 À N. Chaque proposition vient de la venue 1 (pas de chaîne : une date déplacée
    n'entraîne pas la suivante), et ne passe jamais devant la venue précédente. */
export function proposeLesDatesDesVenues(o: {
  dateVenue1: string;
  heureVenue1: string;
  delaisSemaines: readonly number[];
  /** Les jours de la semaine préférés de la cliente (0 = dimanche), ceux de sa fiche. */
  joursPreferes?: readonly number[];
  aujourdhui: string;
  ferme: (iso: string) => boolean;
  /** Les heures de départ libres ce jour-là (les places du maître, hors jours fermés). */
  heuresLibres: (iso: string) => readonly string[];
}): PropositionDeVenue[] {
  const favoris = new Set(o.joursPreferes ?? []);
  const sorties: PropositionDeVenue[] = [];
  let precedente = o.dateVenue1;
  for (const semaines of o.delaisSemaines) {
    const cible = ajouteJours(o.dateVenue1, semaines * 7);
    if (cible < o.aujourdhui) {
      sorties.push({ date: cible, time: o.heureVenue1, cible, semaines, deplacee: false, passee: true,
        raison: `${jourCourt(o.dateVenue1)} + ${semaines} semaines : le ${jourCourt(cible)} est déjà passé, cette venue ne peut pas se poser` });
      precedente = cible;
      continue;
    }
    /* L'heure de ce jour : la même si elle est libre, sinon la plus proche, jamais avant 9 h le samedi. */
    const heureDe = (iso: string): string | null => {
      if (o.ferme(iso)) return null;
      const libres = o.heuresLibres(iso).filter((t) => heureValable(iso, t));
      if (libres.length === 0) return null;
      if (libres.includes(o.heureVenue1) && heureValable(iso, o.heureVenue1)) return o.heureVenue1;
      return [...libres].sort((a, b) => Math.abs(minutes(a) - minutes(o.heureVenue1)) - Math.abs(minutes(b) - minutes(o.heureVenue1)) || minutes(b) - minutes(a))[0];
    };
    const bon = (iso: string): boolean => iso >= o.aujourdhui && iso > precedente;
    const direct = bon(cible) && !o.ferme(cible) && o.heuresLibres(cible).includes(o.heureVenue1) && heureValable(cible, o.heureVenue1);
    let choix: { date: string; time: string } | null = direct ? { date: cible, time: o.heureVenue1 } : null;
    if (!choix) {
      /* LE JOUR LIBRE LE PLUS PROCHE : la même semaine d'abord (un jour favori avant les autres, puis le plus proche),
         ensuite les semaines voisines, jusqu'à trois semaines de part et d'autre. */
      const lundi = lundiDe(cible);
      const distance = (iso: string) => Math.abs(Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${cible}T12:00:00Z`));
      const ordre = (a: string, b: string) => (favoris.has(jourDeLaSemaine(a)) ? 0 : 1) - (favoris.has(jourDeLaSemaine(b)) ? 0 : 1) || distance(a) - distance(b) || (a < b ? -1 : 1);
      const semaine = Array.from({ length: 7 }, (_, i) => ajouteJours(lundi, i));
      const autres = Array.from({ length: 42 }, (_, i) => ajouteJours(cible, i - 21)).filter((d) => !semaine.includes(d));
      for (const jour of [semaine.sort(ordre), autres.sort(ordre)]) {
        for (const d of jour) {
          if (!bon(d)) continue;
          const t = heureDe(d);
          if (t) { choix = { date: d, time: t }; break; }
        }
        if (choix) break;
      }
    }
    if (!choix) {
      sorties.push({ date: '', time: '', cible, semaines, deplacee: true,
        raison: `${jourCourt(o.dateVenue1)} + ${semaines} semaines : aucune place trouvée autour du ${jourCourt(cible)}, choisissez une date` });
      continue;
    }
    const deplacee = choix.date !== cible || choix.time !== o.heureVenue1;
    let raison: string | undefined;
    if (deplacee) {
      const pourquoi = o.ferme(cible) ? `le ${jourCourt(cible)} était fermé` : `le ${jourCourt(cible)} à ${heureDite(o.heureVenue1)} était pris`;
      raison = `${jourCourt(o.dateVenue1)} + ${semaines} semaines : ${pourquoi}, le ${jourCourt(choix.date)} à ${heureDite(choix.time)}`;
    }
    sorties.push({ date: choix.date, time: choix.time, cible, semaines, deplacee, ...(raison ? { raison } : {}) });
    precedente = choix.date;
  }
  return sorties;
}

/** LA VENUE D'UN RENDEZ-VOUS DU PLAN, quel que soit le mode de paiement : son rang et le nombre de venues. */
export function venueDuPlan(a: { momentEnTrois?: Pick<MomentEnTrois, 'rang' | 'tiers'> | null; momentProgramme?: MomentProgramme | null }): { rang: number; n: number } | null {
  if (a.momentEnTrois) return { rang: a.momentEnTrois.rang, n: a.momentEnTrois.tiers.length };
  if (a.momentProgramme) return { rang: a.momentProgramme.rang, n: a.momentProgramme.n };
  return null;
}

export type PlanOuvert = { planId: string; rang: number; n: number; date: string; time?: string };

/** LA CLIENTE A DÉJÀ UN MOMENT EN COURS : la prochaine venue non annulée de son plan, à venir ou du jour. Un second
    plan ne se pose pas par-dessus : l'écran le dit (« Cette cliente a déjà un Moment en cours : venue 2 sur 4 le … »). */
export function planOuvertDeLaCliente(
  rdvs: readonly { clientId?: string; date: string; time?: string; status?: string; momentEnTrois?: Pick<MomentEnTrois, 'planId' | 'rang' | 'tiers'> | null; momentProgramme?: MomentProgramme | null }[],
  clientId: string,
  aujourdhui: string,
): PlanOuvert | null {
  const venues = rdvs
    .filter((r) => r.clientId === clientId && r.status !== 'annulé' && r.date >= aujourdhui && (r.momentEnTrois || r.momentProgramme))
    .map((r) => ({ planId: (r.momentEnTrois?.planId ?? r.momentProgramme!.planId), rang: venueDuPlan(r)!.rang, n: venueDuPlan(r)!.n, date: r.date, time: r.time }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rang - b.rang);
  return venues[0] ?? null;
}

/** La phrase de « déjà un Moment en cours ». */
export const phraseMomentEnCours = (p: PlanOuvert): string =>
  `Cette cliente a déjà un Moment en cours : venue ${p.rang} sur ${p.n} le ${jourCourt(p.date)}`;
