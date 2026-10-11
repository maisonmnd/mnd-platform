import { offresDuTrottoir } from '../../shared/offres-pur';
import { laPorte } from './offre-porte';

/* LA REMISE QUI REVIENT AU DÉFILEMENT — 11 octobre 2026, maquette validée
   (« construis », Yéman), inspirée de Scentbird : un bandeau en haut, une
   pastille sur le bord, une fenêtre à mi-page, un rappel avant le pied.

   CE MODULE EST PUR : il dit QUELLE offre revient et AVEC QUELS MOTS, sans
   rien afficher. La construction l'emploie pour écrire les remises dans la
   page (statique.tsx), le navigateur pour choisir celle du jour (remise.ts) :
   une seule règle, deux lecteurs, comme `offresDuTrottoir`.

   SEULE UNE OFFRE DATÉE REVIENT. Une offre de vitrine, sans dates, dit
   comment la Maison accueille ; elle n'a pas de fin, et une fenêtre qui
   reviendrait toute l'année serait une publicité, pas une saison. */

export type Remise = {
  id: string;
  titre: string;
  tag: string;
  deal: string;
  sub: string;
  code: string;
  bouton: string;
  porte: string;
  parcours: string;
  /** La première phrase de l'offre, courte, pour le bandeau (vide si trop longue). */
  court: string;
  du: string;
  au: string;
  /** « 31 octobre 2026 », l'année toujours dite. */
  auDit: string;
};

/** Les pages où rien ne revient : la réservation et le rappel (le code y est
    déjà posé), les pages légales, la page des offres elle-même, le lien court
    des ambassadrices, la page introuvable. */
export const REMISE_EXCLUE: ReadonlySet<string> = new Set([
  '/reserver/', '/rappel/', '/conditions/', '/confidentialite/', '/mentions-legales/',
  '/plan-du-site/', '/les-offres/', '/m/', '/404.html',
]);

/** Les pages où la fenêtre ne s'ouvre pas d'elle-même : celles dont le
    travail est un formulaire (diagnostic, carte cadeau, parrainage, testeuse).
    Le bandeau, la pastille et le rappel y restent ; la pastille l'ouvre. */
export const FENETRE_RETENUE: ReadonlySet<string> = new Set([
  '/mon-parcours/', '/offrir/', '/parrainage/', '/testeuse/',
]);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 31 octobre 2026 » depuis « 2026-10-31 » ; vide si la date ne se lit pas. */
export function dateDite(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const mois = MOIS[Number(m[2]) - 1];
  if (!mois) return '';
  const jour = Number(m[3]);
  return `${jour === 1 ? '1er' : jour} ${mois} ${m[1]}`;
}

/** La première proposition de la phrase de l'offre, pour le bandeau :
    « Sur les soins, et la Maison reverse… » donne « sur les soins ». Au-delà
    de 60 signes, rien : le bandeau dit alors le titre, la remise et le code. */
export function courtDeLaPhrase(sub: string): string {
  const premiere = String(sub ?? '').split(/[,.;:]/)[0].trim();
  if (!premiere || premiere.length > 60) return '';
  return premiere.charAt(0).toLocaleLowerCase('fr') + premiere.slice(1);
}

/** Les remises à écrire dans la page : les offres du trottoir qui ont une
    date et une remise dite, dans l'ordre où elles commencent. Avec `depuis`
    (le jour de la construction), celles déjà finies restent dehors. */
export function remisesAEcrire(liste: unknown, depuis = ''): Remise[] {
  type Brute = { id?: string; title?: string; tag?: string; deal?: string; sub?: string; code?: string; bouton?: string; parcours?: string; du?: string; au?: string; active?: boolean; vitrine?: boolean };
  return offresDuTrottoir<Brute>(liste)
    .filter((o) => !!(o.du || o.au) && !!String(o.deal ?? '').trim() && !!String(o.title ?? '').trim())
    .filter((o) => !depuis || !o.au || o.au >= depuis)
    .sort((a, b) => String(a.du ?? '').localeCompare(String(b.du ?? '')))
    .map((o) => ({
      id: String(o.id ?? o.title),
      titre: String(o.title).trim(),
      tag: String(o.tag ?? '').trim(),
      deal: String(o.deal).trim(),
      sub: String(o.sub ?? '').trim(),
      code: String(o.code ?? '').trim(),
      bouton: String(o.bouton ?? '').trim() || 'J’en profite',
      porte: laPorte({ parcours: o.parcours, code: o.code }),
      parcours: String(o.parcours ?? 'inconnu'),
      court: courtDeLaPhrase(String(o.sub ?? '')),
      du: String(o.du ?? ''),
      au: String(o.au ?? ''),
      auDit: dateDite(String(o.au ?? '')),
    }));
}

/** Le jour à Cotonou, « 2026-10-11 » : une offre finit le soir de la Maison,
    pas celui du téléphone d'une visiteuse à Paris. */
export function jourACotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** La remise du jour : la première qui court ce jour-là, bornes comprises. */
export function remiseDuJour(remises: readonly Remise[], jour: string): Remise | null {
  return remises.find((r) => (!r.du || jour >= r.du) && (!r.au || jour <= r.au)) ?? null;
}
