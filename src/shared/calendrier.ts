/* ══ LE CALENDRIER DE LA MAISON — 12 septembre 2026 ══════════════════
   Maquette `public/maquette-la-date-sans-faute.html`, validée.

   « Lors des saisies de RDV la secrétaire se trompe toujours sur la saisie des
   dates. Comment rendre le processus facile et lisible ? » (Yéman).

   CE N'ÉTAIT PAS UNE DISTRACTION. Le calendrier qu'on lui donnait n'était pas
   celui de la Maison : `<input type="date">` est rendu par le NAVIGATEUR, dans
   SA langue. Sous un Edge en anglais il affiche `mm/jj/aaaa`. Elle tapait le
   3 septembre, il enregistrait le 9 mars, et il avait raison selon ses propres
   règles. Aucune relecture ne pouvait la sauver, puisque la faute naissait
   avant le champ.

   ON REPREND DONC LE CALENDRIER. Semaine commençant le LUNDI, comme partout au
   Bénin ; les jours de fermeture du salon barrés ; et il s'ouvre sur le mois de
   la date en cours, jamais sur aujourd'hui — poser un rituel de janvier depuis
   septembre coûtait vingt clics sur une flèche.

   TOUT EST PUR ICI, et éprouvé par `verifie-calendrier`. Une grille de mois
   fausse d'un jour décale silencieusement tout un carnet. */
import { litUneLigne } from './serie';

/** Le jour de la semaine, LUNDI = 0 — jamais l'index de JavaScript, où la
    semaine commence le dimanche. Cette conversion est la source d'erreur
    classique des grilles de calendrier : on la fait une fois, ici. */
export const jourDeSemaineLundi = (iso: string): number => {
  const d = new Date(`${iso}T00:00:00`);
  return (d.getDay() + 6) % 7;
};

export type CaseDuMois = {
  iso: string;
  /** Le quantième, ce qu'on écrit dans la case. */
  jour: number;
  /** Elle appartient au mois d'avant ou d'après : on la grise. */
  horsMois: boolean;
};

/** LA GRILLE D'UN MOIS, six semaines pleines, lundi en tête.

    SIX SEMAINES TOUJOURS, jamais cinq : une grille dont la hauteur change d'un
    mois à l'autre fait sauter les boutons sous le doigt, et l'on clique sur la
    mauvaise date en croyant viser la bonne. Quarante-deux cases, toujours. */
export function grilleDuMois(annee: number, mois: number): CaseDuMois[] {
  const premier = new Date(annee, mois - 1, 1);
  const decalage = (premier.getDay() + 6) % 7;      // lundi = 0
  const cases: CaseDuMois[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(annee, mois - 1, 1 - decalage + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cases.push({ iso, jour: d.getDate(), horsMois: d.getMonth() !== mois - 1 });
  }
  return cases;
}

/** Le mois d'avant / d'après, en franchissant l'année sans y penser. */
export const moisVoisin = (annee: number, mois: number, pas: number): { annee: number; mois: number } => {
  const m = mois - 1 + pas;
  return { annee: annee + Math.floor(m / 12), mois: ((m % 12) + 12) % 12 + 1 };
};

/* ── L'ANNÉE QUI MANQUE ──────────────────────────────────────────────
   Quand la main tape « 3/9 » sans année, il faut en proposer. */

/** Le sens dans lequel une date se cherche.

    UN RENDEZ-VOUS REGARDE DEVANT, un anniversaire regarde derrière, et le
    champ ne peut pas le deviner. Le défaut d'hier offrait TOUJOURS l'année en
    cours, la précédente et celle d'avant : en décembre, poser un rituel de
    janvier n'avait donc AUCUNE bonne réponse dans la liste. */
export type SensDeLaDate = 'avant' | 'arriere';

/** LES ANNÉES À PROPOSER, la plus probable en tête.

    Vers l'AVANT : l'année qui met la date dans le futur passe devant. Un
    « 3/9 » tapé en décembre 2026 vise le 3 septembre 2027, pas celui d'il y a
    trois mois — et c'est la règle qui manquait.

    Vers l'ARRIÈRE : l'année en cours, puis les deux précédentes, comme avant. */
export function anneesPossibles(
  jourMois: string, aujourdhui: string, sens: SensDeLaDate,
): number[] {
  const anCourant = Number(aujourdhui.slice(0, 4));
  if (sens === 'arriere') return [anCourant, anCourant - 1, anCourant - 2];
  /* `jourMois` est un « MM-JJ ». Si ce jour est déjà passé cette année, alors
     l'année suivante est la plus probable — mais on garde l'année en cours en
     second, parce qu'on rattrape parfois un rituel de la semaine dernière. */
  const dejaPasse = `${anCourant}-${jourMois}` < aujourdhui;
  return dejaPasse
    ? [anCourant + 1, anCourant, anCourant + 2]
    : [anCourant, anCourant + 1, anCourant - 1];
}

/** DEPUIS COMBIEN DE JOURS CETTE DATE EST-ELLE DERRIÈRE NOUS ?
    Zéro si elle est aujourd'hui ou devant. */
export const retardEnJours = (iso: string, aujourdhui: string): number => {
  if (!iso || iso >= aujourdhui) return 0;
  const a = new Date(`${iso}T00:00:00`).getTime();
  const b = new Date(`${aujourdhui}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
};

/** CE QU'ELLE VOULAIT PROBABLEMENT DIRE — quand la date tombe dans le passé.

    Deux corrections, et deux seulement : la MÊME date l'an prochain, et le
    JOUR ET LE MOIS ÉCHANGÉS. La seconde est la faute du calendrier anglais,
    celle qui a coûté des rendez-vous : « 3/9 » lu 9 mars au lieu du 3
    septembre. La proposer, c'est refermer le piège devant celle qui vient
    d'y tomber.

    On ne propose que ce qui est DEVANT : une correction qui laisserait la date
    dans le passé ne corrige rien. */
export function correctionsPossibles(iso: string, aujourdhui: string): string[] {
  if (!iso || retardEnJours(iso, aujourdhui) === 0) return [];
  const [a, m, j] = iso.split('-');
  const sortie: string[] = [];

  const anProchain = `${Number(a) + 1}-${m}-${j}`;
  if (anProchain > aujourdhui) sortie.push(anProchain);

  /* L'ÉCHANGE N'A DE SENS QUE SI LE QUANTIÈME PEUT ÊTRE UN MOIS. Le 27 mars
     échangé donnerait un vingt-septième mois : on se tait plutôt que de
     proposer une absurdité. */
  const nj = Number(j);
  if (nj >= 1 && nj <= 12) {
    const echange = `${a}-${String(nj).padStart(2, '0')}-${m}`;
    /* Et seulement si le jour existe dans ce mois-là : le 31 avril n'est pas
       une date, et l'offrir ferait douter de tout le reste. */
    const d = new Date(`${echange}T00:00:00`);
    const valide = !Number.isNaN(d.getTime())
      && String(d.getMonth() + 1).padStart(2, '0') === String(nj).padStart(2, '0');
    if (valide && echange > aujourdhui) sortie.push(echange);
    else if (valide) {
      const echangeProchain = `${Number(a) + 1}-${String(nj).padStart(2, '0')}-${m}`;
      if (echangeProchain > aujourdhui) sortie.push(echangeProchain);
    }
  }
  return sortie;
}

/* ══ JOUR · MOIS · ANNÉE, PARTOUT — 13 septembre 2026 ═════════════════
   « Sur la page de RDV et d'encaissement que les dates soient toujours
   réglées sur la date des francophones : jour, mois, année. Même chose pour
   les dates d'anniversaire sur le profil des clients. Quel que soit le
   service, respecter le même format » (Yéman).

   UNE SEULE ÉCRITURE DU JOUR, pour toutes les sœurs. Le mois s'écrit en
   lettres : « 3 sept. 2026 » ne se lit que d'une façon, là où « 03/09/2026 »
   se lit 9 mars sous un navigateur anglais. Ces trois formes servaient déjà
   au Carnet (`frJourAn`, `frShortAn`, `frLongAn`) ; elles vivent désormais ici
   pour que Ma Couronne, le Certificat et le Bilan écrivent la même chose. */

const ISO_DU_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Une date illisible s'écrit « — », jamais « Invalid Date » : au comptoir, un
    tiret se comprend, un message d'erreur anglais inquiète la cliente. */
const ecritLeJour = (iso: string | null | undefined, forme: Intl.DateTimeFormatOptions): string => {
  const jour = String(iso ?? '').slice(0, 10);
  if (!ISO_DU_JOUR.test(jour)) return '—';
  const d = new Date(`${jour}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', forme);
};

/** « 12 sept. 2026 » */
export const jourAn = (iso?: string | null): string =>
  ecritLeJour(iso, { day: 'numeric', month: 'short', year: 'numeric' });

/** « Sam. 12 sept. 2026 » */
export const jourCourtAn = (iso?: string | null): string =>
  majuscule(ecritLeJour(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));

/** « Samedi 12 septembre 2026 » : la relecture du champ, où le jour de la
    semaine sert d'alarme (la cliente dit samedi, l'écran dit mercredi). */
export const jourEnLettres = (iso?: string | null): string =>
  majuscule(ecritLeJour(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

/* ── LES BORNES ──────────────────────────────────────────────────────
   Le calendrier du navigateur respectait `min` et `max` : une naissance ne
   pouvait pas tomber demain, une reprogrammation pas hier. Le champ de la
   Maison doit tenir la même promesse, sinon le remplacer aurait ôté une
   garde en ajoutant une lisibilité. */
export type HorsBornes = 'trop-tot' | 'trop-tard';

export const horsBornes = (iso: string, min?: string, max?: string): HorsBornes | undefined => {
  if (min && iso < min) return 'trop-tot';
  if (max && iso > max) return 'trop-tard';
  return undefined;
};

export type DateLue = {
  /** Le jour lu, même hors bornes : on le relit à l'écran pour dire pourquoi
      il est refusé. */
  iso?: string;
  /** L'année n'a pas été tapée : elle vient du défaut, et les années
      possibles s'offrent. */
  anneeSupposee: boolean;
  /** Les années à proposer, déjà filtrées par les bornes. */
  candidats: number[];
  horsBornes?: HorsBornes;
};

/** CE QUE LA MAIN A TAPÉ, LU UNE FOIS POUR TOUTES.

    Le lecteur est celui de la saisie en série (`litUneLigne`) : « 3/9 »,
    « 3-9-26 », « 3 sept », « 3 septembre 2026 », et la date déjà mise en forme
    que le champ affiche lui-même (« 12 sept. 2026 ») — sans quoi rouvrir un
    champ rempli le ferait passer en rouge. Le JOUR VIENT TOUJOURS EN PREMIER. */
export function litLaDate(
  texte: string,
  o: { annee: number; aujourdhui: string; sens: SensDeLaDate; min?: string; max?: string },
): DateLue {
  /* Une date à moitié tapée n'est pas une faute : « 14/02/ » perd son
     séparateur de fin avant la lecture. */
  const enClair = texte.trim().replace(/[/\-.\s]+$/, '');
  if (enClair === '') return { anneeSupposee: false, candidats: [] };
  const iso = litUneLigne(enClair, o.annee).iso;
  if (!iso) return { anneeSupposee: false, candidats: [] };
  /* L'ANNÉE A-T-ELLE ÉTÉ TAPÉE ? On relit la ligne avec une année absurde :
     si le résultat la porte, c'est qu'elle venait du défaut, pas de la main. */
  const anneeSupposee = litUneLigne(enClair, 1904).iso?.slice(0, 4) === '1904';
  const candidats = anneeSupposee
    ? anneesPossibles(iso.slice(5), o.aujourdhui, o.sens).filter((an) => {
        const autre = litUneLigne(enClair, an).iso;
        return !!autre && !horsBornes(autre, o.min, o.max);
      })
    : [];
  return { iso, anneeSupposee, candidats, horsBornes: horsBornes(iso, o.min, o.max) };
}
