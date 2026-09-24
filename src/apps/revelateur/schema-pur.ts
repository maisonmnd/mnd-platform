/* LA FICHE STRUCTURÉE, SA PART PURE — 24 septembre 2026.

   Google lit `openingHoursSpecification` pour dire « ouvert maintenant » dans
   les résultats locaux. Les horaires sont ceux du Trône (`mnd_settings`,
   lisible sans compte), lus à la construction : ce module les traduit dans
   la forme de schema.org, sans rien importer, pour que le harnais l'éprouve
   sans réseau. Un jour fermé n'écrit rien ; des jours consécutifs aux mêmes
   heures se regroupent en une seule règle, comme Google le préfère. */

export type JourDeLaSemaine = { key: string; open: string; close: string; closed: boolean };

const SCHEMA: Record<string, string> = {
  lun: 'Monday', mar: 'Tuesday', mer: 'Wednesday', jeu: 'Thursday', ven: 'Friday', sam: 'Saturday', dim: 'Sunday',
};
const ORDRE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
/* Le Trône écrit ses heures à la française, « 08h00 », « 20h30 » ; schema.org
   les veut « 08:00 ». Les deux formes sont lues, une seule est écrite. */
const HEURE = /^(\d{2})[h:](\d{2})$/;
const heureSchema = (h: string): string | null => {
  const m = HEURE.exec(h);
  return m ? `${m[1]}:${m[2]}` : null;
};

export type HorairesStructures = { '@type': 'OpeningHoursSpecification'; dayOfWeek: string[]; opens: string; closes: string }[];

export function horairesStructures(semaine: readonly JourDeLaSemaine[] | undefined): HorairesStructures {
  if (!Array.isArray(semaine)) return [];
  const regles: HorairesStructures = [];
  for (const cle of ORDRE) {
    const j = semaine.find((x) => x && x.key === cle);
    if (!j || j.closed) continue;
    const opens = heureSchema(j.open), closes = heureSchema(j.close);
    if (!opens || !closes || opens >= closes) continue;
    const derniere = regles[regles.length - 1];
    if (derniere && derniere.opens === opens && derniere.closes === closes) derniere.dayOfWeek.push(SCHEMA[cle]);
    else regles.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: [SCHEMA[cle]], opens, closes });
  }
  return regles;
}
