import { hourToMin, ouvertureDuJour, type ExceptionDHoraire, type HeureDeLaSemaine } from '../../shared/agenda-pur';

/* LES HEURES DE LA MAISON, DITES AU TROTTOIR — 21 septembre 2026.

   La page contact ne portait aucun horaire, alors que c'est la première
   question qu'on pose à un salon. Les heures existaient déjà : `mnd_settings`
   les descend, et le calendrier de réservation les lit depuis toujours. Elles
   se disent donc ici À LA MÊME SOURCE, jamais recopiées : la Maison change ses
   heures au Trône et la page suit, sans publication.

   DEUX RÈGLES DE PRUDENCE.

   ① Sans semaine connue, ON NE DIT RIEN. Une page qui affiche « fermé » parce
      que la base n'a pas répondu ferme la Maison aux yeux de qui passe ; une
      page qui n'affiche rien laisse le téléphone et WhatsApp faire leur
      travail. C'est la même leçon que le lundi 12 octobre côté réservation.

   ② L'ÉTAT DU JOUR TIENT COMPTE DES FERMETURES EXCEPTIONNELLES, la liste des
      sept jours non. Une exception passée n'a plus rien à dire mardi
      prochain ; celle d'aujourd'hui, si, et c'est justement le jour où se
      tromper coûte un déplacement pour rien. */

const ORDRE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;
const NOMS: Record<string, string> = {
  lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi',
  ven: 'vendredi', sam: 'samedi', dim: 'dimanche',
};

/* LA GRAPHIE DE LA MAISON EST `09h00`, celle qu'écrit Personnel › Paramètres
   et que lit le calendrier de réservation. On ne la réaffiche pas telle
   quelle : on la passe par `hourToMin`, la fonction du Trône, puis on la
   récrit. Un « 9h » saisi à la va-vite ressort donc « 09h00 », et une valeur
   en `09:00` se lirait aussi bien. */
const deMinutes = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const plusDeJours = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/* UNE HEURE VIDE N'EST PAS NEUF HEURES — 21 septembre 2026, au soir.

   `hourToMin` ne connaît que la graphie `09h00` et retombe SILENCIEUSEMENT
   sur 9 h pour tout le reste, la chaîne vide comprise. Une journée
   exceptionnelle naît avec ses deux champs vides, et rien n'empêche de vider
   l'heure d'un jour ordinaire sans cocher « fermé » : la page annonçait alors
   « 09h00 à 09h00 » au trottoir. Une fenêtre qui ne s'ouvre pas est une
   journée fermée, et on la dit fermée. La garde vit ici, pas dans
   `hourToMin` : durcir le Trône un soir de publication aurait fait bouger la
   réservation, la couronne et les offres pour une faute qui est ici. */
const ouverte = (f: { closed: boolean; openMin: number; closeMin: number }): boolean =>
  !f.closed && f.closeMin > f.openMin;

const sansHeure = (j?: HeureDeLaSemaine): boolean =>
  !j || j.closed || !j.open.trim() || !j.close.trim();

export type JourDit = { clef: string; jour: string; texte: string; aujourdhui: boolean };

/** Les sept jours tels qu'on les lit, du lundi au dimanche. La ligne du jour
    porte la fenêtre RÉELLE (exception comprise), les six autres la fenêtre
    ordinaire. Semaine vide : rien à lire, et l'appelante n'affiche rien. */
export function semaineDite(
  semaine: readonly HeureDeLaSemaine[],
  exceptions: readonly ExceptionDHoraire[],
  maintenant: Date,
): JourDit[] {
  if (!semaine.length) return [];
  const clefAuj = ORDRE[(maintenant.getDay() + 6) % 7];
  return ORDRE.map((clef) => {
    const aujourdhui = clef === clefAuj;
    if (aujourdhui) {
      const f = ouvertureDuJour(iso(maintenant), semaine, exceptions);
      return {
        clef, jour: NOMS[clef], aujourdhui,
        texte: ouverte(f) ? `${deMinutes(f.openMin)} à ${deMinutes(f.closeMin)}` : 'fermé',
      };
    }
    const j = semaine.find((h) => h.key === clef);
    return {
      clef, jour: NOMS[clef], aujourdhui,
      texte: sansHeure(j) ? 'fermé' : `${deMinutes(hourToMin(j!.open))} à ${deMinutes(hourToMin(j!.close))}`,
    };
  });
}

export type EtatDeLaMaison = { ouvert: boolean; texte: string };

/** Ce qu'on cherche vraiment en arrivant sur la page : est-ce ouvert, là,
    maintenant. Rendu `null` quand la Maison n'a pas descendu ses heures. */
export function etatDeLaMaison(
  semaine: readonly HeureDeLaSemaine[],
  exceptions: readonly ExceptionDHoraire[],
  maintenant: Date,
): EtatDeLaMaison | null {
  if (!semaine.length) return null;
  const f = ouvertureDuJour(iso(maintenant), semaine, exceptions);
  const m = maintenant.getHours() * 60 + maintenant.getMinutes();
  if (ouverte(f) && m >= f.openMin && m < f.closeMin) {
    return { ouvert: true, texte: `Ouvert jusqu’à ${deMinutes(f.closeMin)}` };
  }
  /* AVANT L'HEURE, LE JOUR MÊME : c'est le cas du matin, et dire « ouvre
     demain » à neuf heures moins le quart serait faux. */
  if (ouverte(f) && m < f.openMin) {
    return { ouvert: false, texte: `Fermé, ouvre à ${deMinutes(f.openMin)}` };
  }
  for (let p = 1; p <= 7; p++) {
    const d = plusDeJours(maintenant, p);
    const g = ouvertureDuJour(iso(d), semaine, exceptions);
    if (!ouverte(g)) continue;
    const quand = p === 1 ? 'demain' : NOMS[ORDRE[(d.getDay() + 6) % 7]];
    return { ouvert: false, texte: `Fermé, ouvre ${quand} à ${deMinutes(g.openMin)}` };
  }
  /* Sept jours fermés d'affilée : on le dit sans promettre de date. */
  return { ouvert: false, texte: 'Fermé' };
}
